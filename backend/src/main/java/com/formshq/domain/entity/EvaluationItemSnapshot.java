package com.formshq.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "evaluation_item_snapshots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EvaluationItemSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "evaluation_id", nullable = false)
    private Evaluation evaluation;

    @Column(name = "original_item_id")
    private UUID originalItemId;

    @Column(name = "label_snapshot", nullable = false, length = 500)
    private String labelSnapshot;

    @Column(name = "description_snapshot", columnDefinition = "TEXT")
    private String descriptionSnapshot;

    @Column(name = "category_snapshot", nullable = false, length = 120)
    private String categorySnapshot;

    @Column(name = "fatal_error_snapshot", nullable = false)
    @Builder.Default
    private boolean fatalErrorSnapshot = false;

    @Column(name = "points_snapshot", nullable = false)
    @Builder.Default
    private Integer pointsSnapshot = 1;

    @Column(name = "display_order", nullable = false)
    @Builder.Default
    private Integer displayOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean checked = false;

    @Column(columnDefinition = "TEXT")
    private String observation;
}
