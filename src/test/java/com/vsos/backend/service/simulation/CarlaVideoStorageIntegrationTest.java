package com.vsos.backend.service.simulation;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** Chỉ chạy với S3 giả lập được chỉ định rõ, không bao giờ chạm bucket production. */
@EnabledIfEnvironmentVariable(named = "VEHICSIM_S3_TEST_ENDPOINT", matches = ".+")
class CarlaVideoStorageIntegrationTest {
    @TempDir Path directory;

    @Test
    void uploadAndSignedRangeReadAgainstS3Emulator() throws Exception {
        String endpoint = System.getenv("VEHICSIM_S3_TEST_ENDPOINT");
        if (!"127.0.0.1".equals(URI.create(endpoint).getHost())) {
            throw new IllegalArgumentException("Test endpoint must be a loopback emulator");
        }
        String bucket = "vehicsim-video-test";
        var s3config = S3Configuration.builder().pathStyleAccessEnabled(true).build();
        try (var client = S3Client.builder().region(Region.US_EAST_1).endpointOverride(URI.create(endpoint))
                .serviceConfiguration(s3config).build()) {
            client.createBucket(b -> b.bucket(bucket));
        }
        var store = new CarlaVideoStorage(bucket, "us-east-1", endpoint, true);
        try {
            byte[] bytes = new byte[]{11, 22, 33, 44, 55};
            Path video = directory.resolve("video.mp4");
            Files.write(video, bytes);
            assertThat(store.upload(42, video)).isEqualTo("s3://" + bucket + "/runs/42/video.mp4");
            var request = HttpRequest.newBuilder(URI.create(store.viewingUrl(42, false))).header("Range", "bytes=1-3").GET().build();
            var result = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofByteArray());
            assertThat(result.statusCode()).isEqualTo(206);
            assertThat(result.body()).containsExactly(22, 33, 44);
            assertThat(result.headers().firstValue("content-range")).hasValue("bytes 1-3/5");
        } finally {
            store.close();
        }
    }
}
