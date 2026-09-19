ALTER TABLE bevuti ALTER COLUMN data DROP NOT NULL;
NOTIFY pgrst, 'reload schema';
