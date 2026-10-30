ALTER TABLE customers ADD COLUMN IF NOT EXISTS father_name VARCHAR(180);

UPDATE customers
SET mother_name = 'Helena Almeida Prado',
    father_name = 'Carlos Alberto Prado'
WHERE father_name IS NULL;
