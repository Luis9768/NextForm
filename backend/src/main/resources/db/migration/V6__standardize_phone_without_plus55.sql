UPDATE customers
SET phone = REPLACE(phone, '+55', '')
WHERE phone LIKE '+55%';

UPDATE call_records
SET customer_identifier = REPLACE(customer_identifier, '+55', '')
WHERE customer_identifier LIKE '+55%';
