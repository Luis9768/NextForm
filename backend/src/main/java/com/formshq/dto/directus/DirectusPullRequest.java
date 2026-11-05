package com.formshq.dto.directus;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Parâmetros para buscar avaliações diretamente da API REST do Directus (/items/{collection})")
public record DirectusPullRequest(
        @Schema(description = "URL base do Directus (ex: https://directus.suaempresa.com.br)", example = "https://directus.empresa.com")
        String baseUrl,

        @Schema(description = "Static Token (Bearer) do usuário/bot no Directus", example = "directus_static_token_xyz")
        String apiToken,

        @Schema(description = "Nome da Collection no Directus: Monitoria_SAC, Monitoria_Retencao, Monitoria_Tim_Aquisicao ou ALL", example = "ALL")
        String collection,

        @Schema(description = "Limite máximo de registros por collection (padrão: 50, máx: 500)", example = "50")
        Integer limit
) {
}
