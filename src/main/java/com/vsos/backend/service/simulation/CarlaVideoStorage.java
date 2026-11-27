package com.vsos.backend.service.simulation;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;

/** Video chỉ được đưa vào bucket riêng tư; quyền xem vẫn do backend quyết định. */
@Service
public class CarlaVideoStorage {
    private final String bucket;
    private final String prefix;
    private final S3Client client;
    private final S3Presigner presigner;

    public CarlaVideoStorage(String bucket, String region, String endpoint, boolean pathStyle) {
        this(bucket, region, endpoint, pathStyle, "");
    }

    /**
     * {@code prefix}: không gian tên cho key (vd. "integration-tests/<id>/"). Để trống = key chuẩn {@code runs/<id>/video.mp4}.
     * Nhiều database có thể dùng chung một bucket với run ID trùng nhau; môi trường thử phải đặt prefix riêng để không ghi đè video thật.
     */
    @Autowired
    public CarlaVideoStorage(@Value("${vehicsim.video-storage.bucket:}") String bucket,
                             @Value("${vehicsim.video-storage.region:us-east-1}") String region,
                             @Value("${vehicsim.video-storage.endpoint:}") String endpoint,
                             @Value("${vehicsim.video-storage.path-style:false}") boolean pathStyle,
                             @Value("${vehicsim.video-storage.prefix:}") String prefix) {
        this.bucket = bucket.trim();
        String namespace = prefix == null ? "" : prefix.trim().replaceAll("^/+", "");
        this.prefix = namespace.isEmpty() || namespace.endsWith("/") ? namespace : namespace + "/";
        if (this.bucket.isEmpty()) {
            client = null;
            presigner = null;
            return;
        }
        var config = S3Configuration.builder().pathStyleAccessEnabled(pathStyle)
                .chunkedEncodingEnabled(false).build();
        var signingConfig = S3Configuration.builder().pathStyleAccessEnabled(pathStyle)
                .checksumValidationEnabled(false).build();
        var c = S3Client.builder().region(Region.of(region)).serviceConfiguration(config);
        var p = S3Presigner.builder().region(Region.of(region)).serviceConfiguration(signingConfig);
        if (!endpoint.isBlank()) {
            URI uri = URI.create(endpoint);
            if (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme())) {
                throw new IllegalArgumentException("VEHICSIM_VIDEO_ENDPOINT must be an HTTP(S) URL");
            }
            c.endpointOverride(uri);
            // Một số dịch vụ S3-compatible không nhận CRC32 mặc định của SDK 2.30+.
            c.requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED);
            p.endpointOverride(uri);
        }
        client = c.build();
        presigner = p.build();
    }

    public boolean enabled() { return client != null; }

    private String key(long runId) { return prefix + "runs/" + runId + "/video.mp4"; }

    public String upload(long runId, Path file) {
        if (!enabled()) throw new IllegalStateException("Video storage is disabled");
        String key = key(runId);
        client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType("video/mp4").build(), RequestBody.fromFile(file));
        return "s3://" + bucket + "/" + key;
    }

    /** Không ký URL bất kỳ từ DB: chỉ ký chính bucket và key của run được phép truy cập. */
    public boolean matches(long runId, String storageUrl) {
        return enabled() && ("s3://" + bucket + "/" + key(runId)).equals(storageUrl);
    }

    public String viewingUrl(long runId, boolean download) {
        if (!enabled()) throw new IllegalStateException("Video storage is disabled");
        var object = GetObjectRequest.builder().bucket(bucket).key(key(runId));
        if (download) object.responseContentDisposition("attachment; filename=\"vehicsim-run-" + runId + ".mp4\"");
        var request = object.build();
        var signed = presigner.presignGetObject(GetObjectPresignRequest.builder().signatureDuration(Duration.ofMinutes(15))
                .getObjectRequest(request).build());
        if (!signed.isBrowserExecutable()) throw new IllegalStateException("Signed video URL requires unsupported headers");
        return signed.url().toExternalForm();
    }

    @PreDestroy
    public void close() {
        if (client != null) client.close();
        if (presigner != null) presigner.close();
    }
}
