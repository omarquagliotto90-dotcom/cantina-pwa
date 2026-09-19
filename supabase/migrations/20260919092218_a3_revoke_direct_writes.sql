BEGIN;

REVOKE INSERT, UPDATE, DELETE ON wines, bevuti, wine_images, wine_websites FROM anon;

COMMIT;
