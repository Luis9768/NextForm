ALTER TABLE customers ADD COLUMN IF NOT EXISTS sale_date VARCHAR(60);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date VARCHAR(40);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS mother_name VARCHAR(180);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contracted_plan VARCHAR(150);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS proposal VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS full_address VARCHAR(350);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS due_date VARCHAR(60);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS early_portability VARCHAR(60);

UPDATE customers
SET sale_date = '28/10/2026',
    birth_date = '14/05/1985',
    mother_name = 'Helena Almeida Prado',
    contracted_plan = 'Fibra Empresarial 600 Mega + Pós 50GB',
    proposal = 'PROP-2026-88412',
    payment_method = 'Débito Automático',
    invoice_type = 'Fatura Digital (E-mail / WhatsApp)',
    full_address = 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200',
    due_date = 'Todo dia 10',
    early_portability = 'Sim (Portabilidade Autorizada)'
WHERE sale_date IS NULL;
