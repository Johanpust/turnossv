// =============================================================
// supabase-client.js — Inicialización del cliente de Supabase
// Las credenciales se inyectan desde window.SUPABASE_* que
// se definen en cada HTML antes de cargar este script.
// =============================================================

const _supabaseUrl  = window.SUPABASE_URL;
const _supabaseKey  = window.SUPABASE_ANON_KEY;

if (!_supabaseUrl || !_supabaseKey) {
    console.error('❌ Faltan credenciales de Supabase. Revisá la configuración de SUPABASE_URL y SUPABASE_ANON_KEY.');
}

const supabaseClient = supabase.createClient(_supabaseUrl, _supabaseKey);
