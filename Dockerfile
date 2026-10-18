# Backend VehicSim: Spring Boot (Java 21) + worker Python (lõi mô phỏng, chỉ thư viện chuẩn).
# Java chạy bộ mô phỏng động học như tiến trình con `python3 worker/kinematic_sim.py`, nên image cần python3.

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
    && apt-get install -y --no-install-recommends python3 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m appuser
WORKDIR /app
COPY --from=build /build/target/vehicsim-backend-1.0.0.jar app.jar
COPY worker worker
RUN mkdir -p data/vehicsim && chown -R appuser:appuser /app
USER appuser

ENV VEHICSIM_WORKER_PYTHON=python3
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8001/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
