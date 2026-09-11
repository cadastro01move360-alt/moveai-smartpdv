cd ~/moveai-smartpdv

mkdir -p supabase/migrations

powershell.exe -NoProfile -Command "Get-Clipboard" | sed 's/\r$//' > supabase/migrations/011_role_permissions.sql

echo "===== ARQUIVO CRIADO ====="
ls -lh supabase/migrations/011_role_permissions.sql

echo
echo "===== PRIMEIRAS LINHAS ====="
head -n 8 supabase/migrations/011_role_permissions.sql

echo
echo "===== ULTIMAS LINHAS ====="
tail -n 8 supabase/migrations/011_role_permissions.sql
