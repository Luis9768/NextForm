ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_sectors VARCHAR(500);

ALTER TABLE evaluation_form_templates ADD COLUMN IF NOT EXISTS sector VARCHAR(100);

ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS analyst_sector_snapshot VARCHAR(100);

CREATE TABLE IF NOT EXISTS sector_transition_logs (
    id UUID PRIMARY KEY,
    analyst_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_sector VARCHAR(100) NOT NULL,
    new_sector VARCHAR(100) NOT NULL,
    changed_by_id UUID NOT NULL REFERENCES users(id),
    reason VARCHAR(500),
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sector_logs_analyst ON sector_transition_logs(analyst_id);

UPDATE users
SET allowed_sectors = 'SAC,Cobrança & Retenção,Suporte N1,Retenção & Ouvidoria'
WHERE role = 'ROLE_GESTOR' AND allowed_sectors IS NULL;

UPDATE users u
SET manager_id = (SELECT g.id FROM users g WHERE g.role = 'ROLE_GESTOR' FETCH FIRST 1 ROW ONLY)
WHERE u.role = 'ROLE_ANALISTA' AND u.manager_id IS NULL;

UPDATE evaluation_form_templates
SET sector = 'Cobrança & Retenção'
WHERE sector IS NULL AND LOWER(name) LIKE '%cobran%';

UPDATE evaluation_form_templates
SET sector = 'Suporte N1'
WHERE sector IS NULL AND (LOWER(name) LIKE '%sac%' OR LOWER(name) LIKE '%suporte%');

UPDATE evaluation_form_templates
SET sector = 'Geral'
WHERE sector IS NULL;

UPDATE evaluations e
SET analyst_sector_snapshot = (SELECT u.department FROM users u WHERE u.id = e.analyst_id)
WHERE e.analyst_sector_snapshot IS NULL;
