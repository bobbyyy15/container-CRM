UPDATE public.prospect_clients 
SET pic_id = (SELECT id FROM public.pics WHERE name = 'Your Name' LIMIT 1) 
WHERE pic_id IS NULL;
