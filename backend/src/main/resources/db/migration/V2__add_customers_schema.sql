CREATE TABLE customers (
    id UUID PRIMARY KEY,
    phone VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(180) NOT NULL,
    document VARCHAR(40) NOT NULL,
    email VARCHAR(180),
    protocol VARCHAR(80),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_document ON customers(document);

ALTER TABLE call_records ADD COLUMN customer_id UUID REFERENCES customers(id);
CREATE INDEX idx_call_records_customer ON call_records(customer_id);
