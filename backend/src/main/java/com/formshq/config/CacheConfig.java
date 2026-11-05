package com.formshq.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.JdkSerializationRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Configuration
@EnableCaching
public class CacheConfig implements CachingConfigurer {

    public static final String CACHE_DASHBOARD = "dashboard-summary";
    public static final String CACHE_EVALUATIONS = "evaluations-list";
    public static final String CACHE_CALLS = "calls-list";

    @Value("${app.cache.redis-enabled:false}")
    private boolean redisEnabled;

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory redisConnectionFactory) {
        if (!redisEnabled) {
            log.info("Cache L1 em memória ativado (ConcurrentMapCacheManager).");
            return new ConcurrentMapCacheManager(CACHE_DASHBOARD, CACHE_EVALUATIONS, CACHE_CALLS);
        }

        log.info("Cache distribuído L2 Redis ativado (RedisCacheManager).");
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofMinutes(10))
                .disableCachingNullValues()
                .prefixCacheNameWith("nexform:v1:")
                .serializeValuesWith(
                        RedisSerializationContext.SerializationPair.fromSerializer(
                                new JdkSerializationRedisSerializer(getClass().getClassLoader())
                        )
                );

        Map<String, RedisCacheConfiguration> cacheConfigs = new HashMap<>();
        cacheConfigs.put(CACHE_DASHBOARD, defaultConfig.entryTtl(Duration.ofMinutes(5)));
        cacheConfigs.put(CACHE_EVALUATIONS, defaultConfig.entryTtl(Duration.ofMinutes(5)));
        cacheConfigs.put(CACHE_CALLS, defaultConfig.entryTtl(Duration.ofMinutes(5)));

        return RedisCacheManager.builder(redisConnectionFactory)
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(cacheConfigs)
                .build();
    }

    @Override
    public CacheErrorHandler errorHandler() {
        return new CacheErrorHandler() {
            @Override
            public void handleCacheGetError(RuntimeException exception, Cache cache, Object key) {
                log.warn("Fallback de leitura de cache [{}] para chave [{}]: {}", cache.getName(), key, exception.getMessage());
            }

            @Override
            public void handleCachePutError(RuntimeException exception, Cache cache, Object key, Object value) {
                log.warn("Fallback de escrita de cache [{}] para chave [{}]: {}", cache.getName(), key, exception.getMessage());
            }

            @Override
            public void handleCacheEvictError(RuntimeException exception, Cache cache, Object key) {
                log.warn("Fallback de invalidação de cache [{}] para chave [{}]: {}", cache.getName(), key, exception.getMessage());
            }

            @Override
            public void handleCacheClearError(RuntimeException exception, Cache cache) {
                log.warn("Fallback de limpeza de cache [{}]: {}", cache.getName(), exception.getMessage());
            }
        };
    }
}
