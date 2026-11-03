# Backend VehicSim: Spring Boot (Java 21). Bộ mô phỏng động học chạy trong tiến trình Java (lõi com.vsos.core, ADR-042);
# worker/ chỉ là adapter CARLA, chạy trên máy có CARLA chứ không trong image này.

# ---- Stage 1: Build ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build
COPY .mvn .mvn
COPY mvnw pom.xml ./
# mvnw có thể mang CRLF khi build từ working tree Windows: bỏ \r trước khi chạy.
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw && ./mvnw -B -q dependency:go-offline
COPY src src
RUN ./mvnw -B -q -DskipTests package

# ---- Stage 2: Runtime ----
FROM eclipse-temurin:21-jre
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m appuser
WORKDIR /app
COPY --from=build /build/target/vehicsim-backend-1.0.0.jar app.jar
RUN mkdir -p data/vehicsim && chown -R appuser:appuser /app
USER appuser

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8001/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
