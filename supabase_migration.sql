-- migration to drop the unique constraint on product_dim SKU
-- to enable SCD Type 2 versioning (multiple price versions per SKU)
ALTER TABLE product_dim DROP CONSTRAINT IF EXISTS product_dim_sku_key;
