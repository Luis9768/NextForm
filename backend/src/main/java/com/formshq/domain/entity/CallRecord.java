package com.formshq.domain.entity;

import com.formshq.config.MapToJsonConverter;
import com.formshq.domain.enums.CallStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "call_records")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CallRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "external_call_id", nullable = false, unique = true, length = 120)
    private String externalCallId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "analyst_id", nullable = false)
    private User analyst;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @Column(name = "customer_identifier", nullable = false, length = 120)
    private String customerIdentifier;

    @Column(name = "call_date", nullable = false)
    private OffsetDateTime callDate;

    @Column(name = "duration_seconds", nullable = false)
    private Integer durationSeconds;

    @Column(name = "audio_url", nullable = false, length = 1000)
    private String audioUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    @Builder.Default
    private CallStatus status = CallStatus.PENDENTE;

    @Column(length = 80)
    private String channel;

    @Column(length = 120)
    private String campaign;

    @Convert(converter = MapToJsonConverter.class)
    @Column(name = "metadata_json", columnDefinition = "TEXT")
    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();

    @OneToOne(mappedBy = "callRecord", fetch = FetchType.LAZY)
    private Evaluation evaluation;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

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
