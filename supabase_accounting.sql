-- Run this in your Supabase SQL Editor

CREATE TABLE vendors (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  gst_number TEXT,
  opening_balance NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE staff_details (
  user_id UUID PRIMARY KEY,
  base_salary NUMERIC DEFAULT 0,
  joining_date DATE,
  bank_account_no TEXT,
  ifsc_code TEXT
);

CREATE TABLE salary_records (
  id UUID PRIMARY KEY,
  staff_id UUID NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  transaction_type TEXT NOT NULL, -- 'salary', 'advance'
  payment_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_number TEXT,
  bank_name TEXT,
  opening_balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ledger_transactions (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  account_type TEXT NOT NULL, -- 'bank', 'vendor', 'staff', 'cash'
  account_id UUID,
  transaction_type TEXT NOT NULL, -- 'credit', 'debit'
  amount NUMERIC NOT NULL,
  description TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
