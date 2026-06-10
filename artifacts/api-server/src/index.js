// Bot Discord - RESET COMPLET
// Le bot est inactif et ne fait rien

console.log('🔄 Bot Discord réinitialisé');
console.log('⏸️  Mode inactif - Aucune fonctionnalité');

// Simple heartbeat pour garder le service actif sur Railway
setInterval(() => {
  console.log('[' + new Date().toISOString() + '] Heartbeat');
}, 30000);
