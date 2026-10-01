import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nencdjwiglqhgvglfmtv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbmNkandpZ2xxaGd2Z2xmbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDU3OTUsImV4cCI6MjEwNjM4MTc5NX0.kq6gfZuYVUskXtWinXvtmOtKu48ZGStI2eyNN4erGZk';

export const supabase = createClient(supabaseUrl, supabaseKey);
