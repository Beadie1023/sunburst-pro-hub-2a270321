
-- 1. Update handle_new_user to assign 'contractor' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, company_name, phone)
  VALUES (NEW.id, NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'phone');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'contractor');
  RETURN NEW;
END;
$$;

-- Ensure trigger exists on auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- 2. Backfill existing pending users to contractor (preserve admin)
UPDATE public.user_roles SET role = 'contractor' WHERE role = 'pending';

-- 3. Append missing colors to under-filled collections
INSERT INTO public.paint_colors (code, name, hex, collection, recommended_use) VALUES
-- Lavender Fields (+14)
('LAV-07', 'Sea Lavender', '#C9BFD9', 'Lavender Fields', 'Bedrooms, accent walls'),
('LAV-08', 'Wisteria Mist', '#B8A9C9', 'Lavender Fields', 'Bedrooms, sitting rooms'),
('LAV-09', 'Heather Bloom', '#9F8FB5', 'Lavender Fields', 'Accent walls'),
('LAV-10', 'Twilight Iris', '#7E6E96', 'Lavender Fields', 'Feature walls'),
('LAV-11', 'Lilac Whisper', '#D8CCE3', 'Lavender Fields', 'Bedrooms'),
('LAV-12', 'Orchid Haze', '#A689B9', 'Lavender Fields', 'Living rooms'),
('LAV-13', 'Hibiscus Dawn', '#C2A6D2', 'Lavender Fields', 'Bedrooms'),
('LAV-14', 'Periwinkle Sky', '#B0A8D6', 'Lavender Fields', 'Bedrooms, baths'),
('LAV-15', 'Mauve Petal', '#A892B0', 'Lavender Fields', 'Living rooms'),
('LAV-16', 'Soft Lupine', '#BFB1CC', 'Lavender Fields', 'Bedrooms'),
('LAV-17', 'Dusty Violet', '#8E7AA0', 'Lavender Fields', 'Accent walls'),
('LAV-18', 'Provence Sky', '#9989B0', 'Lavender Fields', 'Living rooms'),
('LAV-19', 'Cottage Lavender', '#CDB9D9', 'Lavender Fields', 'Bedrooms'),
('LAV-20', 'Evening Heather', '#6E6088', 'Lavender Fields', 'Feature walls'),

-- Purple Reign (+14)
('PUR-07', 'Royal Aubergine', '#5B3A6E', 'Purple Reign', 'Feature walls'),
('PUR-08', 'Imperial Plum', '#6E4585', 'Purple Reign', 'Dining rooms'),
('PUR-09', 'Crown Amethyst', '#8B5A9F', 'Purple Reign', 'Accent walls'),
('PUR-10', 'Velvet Grape', '#4F2D5F', 'Purple Reign', 'Feature walls'),
('PUR-11', 'Regal Orchid', '#7A3F8C', 'Purple Reign', 'Accent walls'),
('PUR-12', 'Cardinal Purple', '#5A2D70', 'Purple Reign', 'Feature walls'),
('PUR-13', 'Byzantine Wine', '#6B3A78', 'Purple Reign', 'Dining rooms'),
('PUR-14', 'Magenta Reign', '#9C4F9F', 'Purple Reign', 'Accent walls'),
('PUR-15', 'Iris Majesty', '#7B5AA0', 'Purple Reign', 'Living rooms'),
('PUR-16', 'Plum Velvet', '#553561', 'Purple Reign', 'Feature walls'),
('PUR-17', 'Empress Mauve', '#946C9C', 'Purple Reign', 'Bedrooms'),
('PUR-18', 'Royal Heliotrope', '#8253A8', 'Purple Reign', 'Accent walls'),
('PUR-19', 'Court Damson', '#4A2C58', 'Purple Reign', 'Feature walls'),
('PUR-20', 'Sovereign Lilac', '#A07BB5', 'Purple Reign', 'Bedrooms'),

-- Quiet Plum (+14)
('QPL-07', 'Hushed Plum', '#7E5A78', 'Quiet Plum', 'Bedrooms'),
('QPL-08', 'Soft Damson', '#8C6E89', 'Quiet Plum', 'Bedrooms'),
('QPL-09', 'Mulberry Mist', '#9C7B95', 'Quiet Plum', 'Living rooms'),
('QPL-10', 'Quiet Wine', '#6F4F6A', 'Quiet Plum', 'Dining rooms'),
('QPL-11', 'Powdered Plum', '#B097AC', 'Quiet Plum', 'Bedrooms'),
('QPL-12', 'Smoke Berry', '#7C6678', 'Quiet Plum', 'Living rooms'),
('QPL-13', 'Misty Currant', '#8A7383', 'Quiet Plum', 'Bedrooms'),
('QPL-14', 'Ashen Plum', '#6E5A68', 'Quiet Plum', 'Accent walls'),
('QPL-15', 'Dusty Mauve', '#A88FA0', 'Quiet Plum', 'Bedrooms'),
('QPL-16', 'Faded Heather', '#94808F', 'Quiet Plum', 'Living rooms'),
('QPL-17', 'Aged Boysenberry', '#5F4659', 'Quiet Plum', 'Feature walls'),
('QPL-18', 'Whispered Fig', '#8B7686', 'Quiet Plum', 'Bedrooms'),
('QPL-19', 'Soft Blackberry', '#5A4554', 'Quiet Plum', 'Feature walls'),
('QPL-20', 'Quiet Petal', '#B7A0B0', 'Quiet Plum', 'Bedrooms'),

-- Romance (+14)
('ROM-07', 'Blush Petal', '#F2D0CC', 'Romance', 'Bedrooms, baths'),
('ROM-08', 'Antique Rose', '#D4A5A5', 'Romance', 'Bedrooms'),
('ROM-09', 'Powder Cheek', '#F5C8C2', 'Romance', 'Nurseries, bedrooms'),
('ROM-10', 'Champagne Kiss', '#EBD3C5', 'Romance', 'Living rooms'),
('ROM-11', 'Velvet Rouge', '#B5727C', 'Romance', 'Accent walls'),
('ROM-12', 'Rose Quartz', '#E2BAB6', 'Romance', 'Bedrooms'),
('ROM-13', 'Coral Whisper', '#F0BBA8', 'Romance', 'Bedrooms'),
('ROM-14', 'Soft Cameo', '#E8C7BC', 'Romance', 'Bedrooms'),
('ROM-15', 'Tea Rose', '#D89A99', 'Romance', 'Living rooms'),
('ROM-16', 'Sunset Blush', '#F5B7A4', 'Romance', 'Living rooms'),
('ROM-17', 'Heirloom Pink', '#C68C8E', 'Romance', 'Accent walls'),
('ROM-18', 'Whispered Rose', '#EBC9C5', 'Romance', 'Bedrooms'),
('ROM-19', 'Dusk Romance', '#A86872', 'Romance', 'Feature walls'),
('ROM-20', 'Silken Bloom', '#E1A9A4', 'Romance', 'Bedrooms');
