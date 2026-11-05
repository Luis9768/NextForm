package com.formshq.dto.directus;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;
import java.util.Map;

@Schema(description = "Payload para importação em lote de avaliações vindas do Directus (JSON Export ou Webhook Flow)")
public record DirectusBatchImportRequest(
        @Schema(description = "Collection de origem (Monitoria_SAC, Monitoria_Retencao ou Monitoria_Tim_Aquisicao). Se omitido, o sistema detecta automaticamente pelos campos do JSON.", example = "Monitoria_SAC")
        String collection,

        @Schema(description = "URL base opcional do Directus para resolução de links de áudio (/assets/{id})", example = "https://directus.empresa.com")
        String directusBaseUrl,

        @NotEmpty(message = "A lista de itens do Directus não pode estar vazia.")
        @Schema(description = "Lista de objetos JSON das avaliações no formato nativo do Directus")
        List<Map<String, Object>> items
) {
}
