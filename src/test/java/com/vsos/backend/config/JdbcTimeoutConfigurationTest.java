package com.vsos.backend.config;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class JdbcTimeoutConfigurationTest {
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(DataSourceAutoConfiguration.class))
            .withPropertyValues("spring.config.import=optional:file:./target/timeout-test-no-env.properties");

    @Test void appliesFiniteDefaultsEvenForCustomJdbcUrl() {
        runner.withPropertyValues("spring.datasource.url=jdbc:mysql://127.0.0.1:1/demo?socketTimeout=0")
                .run(context -> {
                    var properties = context.getBean(HikariDataSource.class).getDataSourceProperties();
                    assertThat(properties.getProperty("connectTimeout")).isEqualTo("10000");
                    assertThat(properties.getProperty("socketTimeout")).isEqualTo("60000");
                });
    }

    @Test void allowsOperatorsToAdjustTimeouts() {
        runner.withPropertyValues("VSOS_JDBC_CONNECT_TIMEOUT_MS=2000", "VSOS_JDBC_SOCKET_TIMEOUT_MS=5000")
                .run(context -> {
                    var properties = context.getBean(HikariDataSource.class).getDataSourceProperties();
                    assertThat(properties.getProperty("connectTimeout")).isEqualTo("2000");
                    assertThat(properties.getProperty("socketTimeout")).isEqualTo("5000");
                });
    }
}
