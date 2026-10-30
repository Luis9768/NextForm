package com.formshq.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "evaluation_form_templates")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EvaluationFormTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 180)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "sector", length = 100)
    @Builder.Default
    private String sector = "Geral";

    @Column(name = "passing_score_percentage", nullable = false, precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal passingScorePercentage = new BigDecimal("70.00");

    @Column(nullable = false)
    @Builder.Default
    private Integer version = 1;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @OneToMany(mappedBy = "formTemplate", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    @Builder.Default
    private List<EvaluationFormItem> items = new ArrayList<>();

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public void addItem(EvaluationFormItem item) {
        items.add(item);
        item.setFormTemplate(this);
    }

    public void clearAndSetItems(List<EvaluationFormItem> newItems) {
        this.items.clear();
        if (newItems != null) {
            for (int i = 0; i < newItems.size(); i++) {
                EvaluationFormItem item = newItems.get(i);
                if (item.getDisplayOrder() == null) {
                    item.setDisplayOrder(i + 1);
                }
                addItem(item);
            }
        }
    }

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }
}
