package com.formshq.domain.entity;

import com.formshq.domain.enums.EvaluationStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "evaluations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Evaluation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "call_record_id", nullable = false, unique = true)
    private CallRecord callRecord;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "evaluator_id", nullable = false)
    private User evaluator;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "analyst_id", nullable = false)
    private User analyst;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "form_template_id")
    private EvaluationFormTemplate formTemplate;

    @Column(name = "analyst_sector_snapshot", length = 100)
    private String analystSectorSnapshot;

    @Column(name = "form_name_snapshot", nullable = false, length = 180)
    private String formNameSnapshot;

    @Column(name = "form_version_snapshot", nullable = false)
    private Integer formVersionSnapshot;

    @Column(name = "passing_score_snapshot", nullable = false, precision = 5, scale = 2)
    private BigDecimal passingScoreSnapshot;

    @Column(name = "obtained_points", nullable = false)
    private Integer obtainedPoints;

    @Column(name = "max_possible_points", nullable = false)
    private Integer maxPossiblePoints;

    @Column(name = "raw_score_percentage", nullable = false, precision = 5, scale = 2)
    private BigDecimal rawScorePercentage;

    @Column(name = "final_score_percentage", nullable = false, precision = 5, scale = 2)
    private BigDecimal finalScorePercentage;

    @Column(name = "fatal_error_triggered", nullable = false)
    @Builder.Default
    private boolean fatalErrorTriggered = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private EvaluationStatus status;

    @Column(name = "general_feedback", columnDefinition = "TEXT")
    private String generalFeedback;

    @OneToMany(mappedBy = "evaluation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    @Builder.Default
    private List<EvaluationItemSnapshot> itemSnapshots = new ArrayList<>();

    @Column(name = "evaluated_at", nullable = false)
    private OffsetDateTime evaluatedAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public void addItemSnapshot(EvaluationItemSnapshot snapshot) {
        this.itemSnapshots.add(snapshot);
        snapshot.setEvaluation(this);
    }

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (this.evaluatedAt == null) {
            this.evaluatedAt = now;
        }
        if (this.createdAt == null) {
            this.createdAt = now;
        }
    }
}
