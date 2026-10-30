package com.formshq.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        final String bearerScheme = "bearerAuth";
        final String n8nKeyScheme = "n8nApiKey";

        return new OpenAPI()
                .info(new Info()
                        .title("Forms HQ - Monitoria de Qualidade e Avaliação de Ligações API")
                        .version("1.0.0")
                        .description("API REST para gestão de formulários de monitoria, ingestão de ligações via n8n e avaliação de qualidade com RBAC.")
                        .contact(new Contact().name("Arquitetura Forms HQ").email("arquitetura@empresa.com")))
                .addSecurityItem(new SecurityRequirement().addList(bearerScheme))
                .components(new Components()
                        .addSecuritySchemes(bearerScheme, new SecurityScheme()
                                .name(bearerScheme)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT"))
                        .addSecuritySchemes(n8nKeyScheme, new SecurityScheme()
                                .name("X-API-KEY")
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)));
    }
}
