package com.vsos.backend.service.simulation;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CarlaVideoStorageTest {
    @TempDir Path directory;

    @Test
    void uploadsAndSignsTheExpectedPrivateObject() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var uploaded = new AtomicReference<byte[]>();
        var encoding = new AtomicReference<String>();
        var checksumAlgorithm = new AtomicReference<String>();
        server.createContext("/private/runs/42/video.mp4", exchange -> {
            if ("PUT".equals(exchange.getRequestMethod())) {
                encoding.set(exchange.getRequestHeaders().getFirst("Content-Encoding"));
                checksumAlgorithm.set(exchange.getRequestHeaders().getFirst("x-amz-sdk-checksum-algorithm"));
                byte[] body = exchange.getRequestBody().readAllBytes();
                // AWS SDK có thể gửi payload kiểu aws-chunked kèm chữ ký/checksum.
                if ("aws-chunked".equals(exchange.getRequestHeaders().getFirst("Content-Encoding"))) {
                    int start = 0;
                    while (start + 1 < body.length && !(body[start] == '\r' && body[start + 1] == '\n')) start++;
                    uploaded.set(java.util.Arrays.copyOfRange(body, start + 2, start + 6));
                } else uploaded.set(body);
                exchange.sendResponseHeaders(200, -1);
            } else {
                byte[] bytes = uploaded.get();
                exchange.getResponseHeaders().set("Content-Type", "video/mp4");
                exchange.getResponseHeaders().set("Content-Range", "bytes 1-2/4");
                exchange.sendResponseHeaders(206, 2);
                exchange.getResponseBody().write(bytes, 1, 2);
            }
            exchange.close();
        });
        server.start();
        String oldId = System.getProperty("aws.accessKeyId");
        String oldSecret = System.getProperty("aws.secretAccessKey");
        System.setProperty("aws.accessKeyId", "test-access");
        System.setProperty("aws.secretAccessKey", "test-secret");
        try (var ignored = new AutoCloseable() { public void close() {
            if (oldId == null) System.clearProperty("aws.accessKeyId"); else System.setProperty("aws.accessKeyId", oldId);
            if (oldSecret == null) System.clearProperty("aws.secretAccessKey"); else System.setProperty("aws.secretAccessKey", oldSecret);
            server.stop(0);
        } }) {
            var storage = new CarlaVideoStorage("private", "us-east-1", "http://127.0.0.1:" + server.getAddress().getPort(), true);
            try {
                Path video = directory.resolve("video.mp4");
                Files.write(video, new byte[]{1, 2, 3, 4});
                assertThat(storage.upload(42, video)).isEqualTo("s3://private/runs/42/video.mp4");
                assertThat(uploaded.get()).containsExactly(1, 2, 3, 4);
                assertThat(encoding.get()).isNotEqualTo("aws-chunked");
                assertThat(checksumAlgorithm.get()).isNull();
                assertThat(storage.matches(42, "s3://private/runs/42/video.mp4")).isTrue();
                assertThat(storage.matches(43, "s3://private/runs/42/video.mp4")).isFalse();
                String url = storage.viewingUrl(42, false);
                assertThat(url).contains("X-Amz-Signature=", "X-Amz-Expires=900");
                var request = HttpRequest.newBuilder(URI.create(url)).header("Range", "bytes=1-2").GET().build();
                var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofByteArray());
                assertThat(response.statusCode()).isEqualTo(206);
                assertThat(response.body()).containsExactly(2, 3);
                assertThat(storage.viewingUrl(42, true)).contains("response-content-disposition=");
            } finally {
                storage.close();
            }
        }
    }

    @Test
    void blankBucketKeepsLocalModeAndRejectsUploads() {
        var storage = new CarlaVideoStorage("", "us-east-1", "", false);
        assertThat(storage.enabled()).isFalse();
        assertThatThrownBy(() -> storage.upload(1, directory.resolve("missing"))).isInstanceOf(IllegalStateException.class);
    }
}
