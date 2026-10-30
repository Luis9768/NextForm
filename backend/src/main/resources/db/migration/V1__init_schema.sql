CREATE TABLE users (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(40) NOT NULL,
    department VARCHAR(100),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE evaluation_form_templates (
    id UUID PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    description TEXT,
    passing_score_percentage NUMERIC(5, 2) NOT NULL DEFAULT 70.00,
    version INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE evaluation_form_items (
    id UUID PRIMARY KEY,
    form_template_id UUID NOT NULL REFERENCES evaluation_form_templates(id) ON DELETE CASCADE,
    label VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(120) NOT NULL,
    fatal_error BOOLEAN NOT NULL DEFAULT FALSE,
    points INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_form_items_template ON evaluation_form_items(form_template_id);

CREATE TABLE call_records (
    id UUID PRIMARY KEY,
    external_call_id VARCHAR(120) NOT NULL UNIQUE,
    analyst_id UUID NOT NULL REFERENCES users(id),
    customer_identifier VARCHAR(120) NOT NULL,
    call_date TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_seconds INTEGER NOT NULL,
    audio_url VARCHAR(1000) NOT NULL,
    status VARCHAR(40) NOT NULL,
    channel VARCHAR(80),
    campaign VARCHAR(120),
    metadata_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_call_records_analyst ON call_records(analyst_id);
CREATE INDEX idx_call_records_status ON call_records(status);
CREATE INDEX idx_call_records_call_date ON call_records(call_date);

CREATE TABLE evaluations (
    id UUID PRIMARY KEY,
    call_record_id UUID NOT NULL UNIQUE REFERENCES call_records(id) ON DELETE CASCADE,
    evaluator_id UUID NOT NULL REFERENCES users(id),
    analyst_id UUID NOT NULL REFERENCES users(id),
    form_template_id UUID REFERENCES evaluation_form_templates(id) ON DELETE SET NULL,
    form_name_snapshot VARCHAR(180) NOT NULL,
    form_version_snapshot INTEGER NOT NULL,
    passing_score_snapshot NUMERIC(5, 2) NOT NULL,
    obtained_points INTEGER NOT NULL,
    max_possible_points INTEGER NOT NULL,
    raw_score_percentage NUMERIC(5, 2) NOT NULL,
    final_score_percentage NUMERIC(5, 2) NOT NULL,
    fatal_error_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(40) NOT NULL,
    general_feedback TEXT,
    evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_evaluations_analyst ON evaluations(analyst_id);
CREATE INDEX idx_evaluations_evaluator ON evaluations(evaluator_id);
CREATE INDEX idx_evaluations_status ON evaluations(status);

CREATE TABLE evaluation_item_snapshots (
    id UUID PRIMARY KEY,
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    original_item_id UUID,
    label_snapshot VARCHAR(500) NOT NULL,
    description_snapshot TEXT,
    category_snapshot VARCHAR(120) NOT NULL,
    fatal_error_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
    points_snapshot INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    checked BOOLEAN NOT NULL DEFAULT FALSE,
    observation TEXT
);

CREATE INDEX idx_eval_snapshots_evaluation ON evaluation_item_snapshots(evaluation_id);
