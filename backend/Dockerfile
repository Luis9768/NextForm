# ==============================================================================
# Stage 1: Build Stage (Maven + Eclipse Temurin Java 21)
# ==============================================================================
FROM maven:3.9.9-eclipse-temurin-21-alpine AS build
WORKDIR /workspace

# Cache dependencies layer first
COPY pom.xml ./
RUN mvn dependency:go-offline -B

# Copy source code and package optimized Spring Boot fat JAR
COPY src ./src
RUN mvn clean package -DskipTests -B && \
    java -Djarmode=layertools -jar target/*.jar extract --destination target/extracted

# ==============================================================================
# Stage 2: Production Runtime Stage (Eclipse Temurin 21 JRE Alpine - Non-Root)
# ==============================================================================
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

# Security Hardening: Create non-root user and group
RUN addgroup -g 1001 -S spring && \
    adduser -u 1001 -S spring -G spring && \
    mkdir -p /app/data && \
    chown -R spring:spring /app

# Copy layered JAR artifacts for optimal image caching and fast startup
COPY --from=build --chown=spring:spring /workspace/target/extracted/dependencies/ ./
COPY --from=build --chown=spring:spring /workspace/target/extracted/spring-boot-loader/ ./
COPY --from=build --chown=spring:spring /workspace/target/extracted/snapshot-dependencies/ ./
COPY --from=build --chown=spring:spring /workspace/target/extracted/application/ ./

USER spring:spring

EXPOSE 8080

ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom"

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
