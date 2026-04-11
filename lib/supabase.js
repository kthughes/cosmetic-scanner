import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://kruakivbmooipriaavcz.supabase.co"
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtydWFraXZibW9vaXByaWFhdmN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTcyMTUsImV4cCI6MjA5MTM5MzIxNX0.efOKkwGJSc7w_kvqCTF4gZcODRjljT-F4NdFUv2Iqog"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
