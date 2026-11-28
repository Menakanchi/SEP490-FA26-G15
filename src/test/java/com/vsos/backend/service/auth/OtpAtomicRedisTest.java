package com.vsos.backend.service.auth;

import com.vsos.backend.config.AuthProperties;
import com.vsos.backend.security.JwtService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Opt-in only: a disposable Redis instance on loopback; only fixture keys are removed. */
@EnabledIfEnvironmentVariable(named = "VSOS_SECURITY_REDIS_PORT", matches = "[0-9]+")
class OtpAtomicRedisTest {
    private static final AuthProperties PROPS = new AuthProperties(60, 600, 5, 0, 5, 10, 20, 10, 900, "otp", "");
    private LettuceConnectionFactory factory;
    private StringRedisTemplate base;
    private String email;
    private JwtService jwt;

    @BeforeEach void setup() {
        factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration("127.0.0.1", Integer.parseInt(System.getenv("VSOS_SECURITY_REDIS_PORT"))));
        factory.afterPropertiesSet();
        base = new StringRedisTemplate(factory);
        base.afterPropertiesSet();
        email = UUID.randomUUID() + "@example.invalid";
        jwt = new JwtService(PROPS, mock(com.vsos.backend.security.TokenRevocationStore.class));
        ReflectionTestUtils.setField(jwt, "secretKey", "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970");
    }

    @AfterEach void cleanup() {
        base.delete("otp:register:" + email);
        base.delete("otp:reset:" + email);
        base.delete("ratelimit:test:" + email);
        base.delete("ratelimit:login_acct:" + email);
        factory.destroy();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    @Test void supersededCodeCannotConsumeOrAuthenticateAgainstNewCode() {
        StringRedisTemplate redis = spy(base);
        HashOperations hash = spy(base.opsForHash());
        doReturn(hash).when(redis).opsForHash();
        OtpService otp = new OtpService(redis, PROPS, jwt);
        String oldCode = otp.issue(OtpService.Purpose.REGISTER, email).orElseThrow();
        AtomicBoolean replace = new AtomicBoolean(true);
        AtomicReference<String> replacement = new AtomicReference<>();
        Runnable issueReplacement = () -> {
            if (replace.compareAndSet(true, false)) {
                String code;
                do { code = otp.issue(OtpService.Purpose.REGISTER, email).orElseThrow(); } while (code.equals(oldCode));
                replacement.set(code);
            }
        };
        String key = "otp:register:" + email;
        doAnswer(call -> { Object old = call.callRealMethod(); issueReplacement.run(); return old; }).when(hash).get(key, "h");
        doAnswer(call -> { issueReplacement.run(); return call.callRealMethod(); })
                .when(redis).execute(any(RedisScript.class), anyList(), any(Object[].class));
        assertThat(otp.verify(OtpService.Purpose.REGISTER, email, oldCode)).isFalse();
        assertThat(replacement.get()).isNotNull();
        assertThat(otp.verify(OtpService.Purpose.REGISTER, email, replacement.get())).isTrue();
        assertThat(otp.verify(OtpService.Purpose.REGISTER, email, replacement.get())).isFalse();
    }

    @Test void wrongAttemptsExpireCodeAndNeverRevealRawCode() {
        OtpService otp = new OtpService(base, PROPS, jwt);
        String code = otp.issue(OtpService.Purpose.REGISTER, email).orElseThrow();
        String key = "otp:register:" + email;
        assertThat(base.opsForHash().get(key, "h").toString()).hasSize(64).isNotEqualTo(code);
        assertThat(base.getExpire(key)).isPositive();
        String wrong = code.equals("000000") ? "111111" : "000000";
        for (int i = 0; i < PROPS.otpMaxAttempts(); i++) assertThat(otp.verify(OtpService.Purpose.REGISTER, email, wrong)).isFalse();
        assertThat(otp.verify(OtpService.Purpose.REGISTER, email, code)).isFalse();
        assertThat(base.hasKey(key)).isFalse();
    }

    @Test void issuanceStoresCodeAndExpiryInOneRedisOperation() {
        StringRedisTemplate redis = spy(base);
        String key = "otp:register:" + email;
        doThrow(new IllegalStateException("separate expire interrupted"))
                .when(redis).expire(eq(key), any(java.time.Duration.class));
        OtpService otp = new OtpService(redis, PROPS, jwt);
        String code = otp.issue(OtpService.Purpose.REGISTER, email).orElseThrow();
        assertThat(base.getExpire(key)).isPositive();
        assertThat(otp.verify(OtpService.Purpose.REGISTER, email, code)).isTrue();
    }

    @Test void concurrentCorrectCodeCanBeUsedOnlyOnce() throws Exception {
        OtpService otp = new OtpService(base, PROPS, jwt);
        String code = otp.issue(OtpService.Purpose.REGISTER, email).orElseThrow();
        var executor = Executors.newFixedThreadPool(16);
        var start = new CountDownLatch(1);
        try {
            var results = new ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 16; i++) results.add(executor.submit(() -> {
                start.await();
                return otp.verify(OtpService.Purpose.REGISTER, email, code);
            }));
            start.countDown();
            int successes = 0;
            for (var result : results) if (result.get(10, TimeUnit.SECONDS)) successes++;
            assertThat(successes).isEqualTo(1);
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(10, TimeUnit.SECONDS);
        }
    }

    @Test void concurrentWrongCodesExhaustTheAttemptLimit() throws Exception {
        OtpService otp = new OtpService(base, PROPS, jwt);
        String code = otp.issue(OtpService.Purpose.REGISTER, email).orElseThrow();
        String wrong = code.equals("000000") ? "111111" : "000000";
        var executor = Executors.newFixedThreadPool(16);
        var start = new CountDownLatch(1);
        try {
            var results = new ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 16; i++) results.add(executor.submit(() -> {
                start.await();
                return otp.verify(OtpService.Purpose.REGISTER, email, wrong);
            }));
            start.countDown();
            for (var result : results) assertThat(result.get(10, TimeUnit.SECONDS)).isFalse();
            assertThat(otp.verify(OtpService.Purpose.REGISTER, email, code)).isFalse();
            assertThat(base.hasKey("otp:register:" + email)).isFalse();
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(10, TimeUnit.SECONDS);
        }
    }

    @Test void missingRateLimitExpiryIsRepairedAndCorruptCountersFailClosed() {
        OtpService otp = new OtpService(base, PROPS, jwt);
        String key = "ratelimit:test:" + email;
        base.opsForValue().set(key, "2");
        assertThat(base.getExpire(key)).isEqualTo(-1);
        assertThat(otp.hitRateLimit("test", email, 10)).isFalse();
        assertThat(base.getExpire(key)).isPositive();
        base.opsForValue().set(key, "10");
        assertThat(otp.isRateLimited("test", email, 10)).isTrue();
        assertThat(base.getExpire(key)).isPositive();
        base.opsForValue().set(key, "not-a-number");
        assertThatThrownBy(() -> otp.isRateLimited("test", email, 10)).isInstanceOf(IllegalStateException.class);
    }

    @Test void reservationsLimitConcurrentLoginsAndSuccessDoesNotErasePendingAttempts() throws Exception {
        OtpService otp = new OtpService(base, PROPS, jwt);
        var executor = Executors.newFixedThreadPool(16);
        var start = new CountDownLatch(1);
        try {
            var results = new ArrayList<java.util.concurrent.Future<String>>();
            for (int i = 0; i < 16; i++) results.add(executor.submit(() -> {
                start.await();
                return otp.reserveLogin(email, 3);
            }));
            start.countDown();
            var accepted = new ArrayList<String>();
            for (var result : results) { String attempt = result.get(10, TimeUnit.SECONDS); if (attempt != null) accepted.add(attempt); }
            assertThat(accepted).hasSize(3);
            otp.finishLogin(email, accepted.get(0), true);
            assertThat(otp.reserveLogin(email, 3)).isNotNull();
            assertThat(otp.reserveLogin(email, 3)).isNull();
            otp.finishLogin(email, accepted.get(1), false);
            otp.finishLogin(email, accepted.get(1), false); // completion is idempotent
            assertThat(base.opsForHash().get("ratelimit:login_acct:" + email, "failures")).isEqualTo("1");
        } finally {
            executor.shutdownNow();
            executor.awaitTermination(10, TimeUnit.SECONDS);
        }
    }

    @Test void legacyAccountCounterAndTtlArePreserved() {
        OtpService otp = new OtpService(base, PROPS, jwt);
        String key = "ratelimit:login_acct:" + email;
        base.opsForValue().set(key, "2", java.time.Duration.ofSeconds(40));
        String attempt = otp.reserveLogin(email, 3);
        assertThat(attempt).isNotNull();
        assertThat(otp.reserveLogin(email, 3)).isNull();
        assertThat(base.getExpire(key)).isBetween(1L, 40L);
        otp.finishLogin(email, attempt, false);
        assertThat(otp.reserveLogin(email, 3)).isNull();
    }
}
