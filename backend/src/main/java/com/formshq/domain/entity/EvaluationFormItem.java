package com.formshq.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "evaluation_form_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EvaluationFormItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "form_template_id", nullable = false)
    private EvaluationFormTemplate formTemplate;

    @Column(nullable = false, length = 500)
    private String label;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, length = 120)
    private String category;

    @Column(name = "fatal_error", nullable = false)
    @Builder.Default
    private boolean fatalError = false;

    @Column(nullable = false)
    @Builder.Default
    private Integer points = 1;

    @Column(name = "display_order", nullable = false)
    @Builder.Default
    private Integer displayOrder = 0;
}
