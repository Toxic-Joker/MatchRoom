// On-air wording. Every label on screen comes from here, so a show stays in one language.
const STRINGS = {
  en: {
    og: 'OG', goal: 'Goal', ownGoal: 'Own goal', penaltyGoal: 'Penalty', yellow: 'Yellow card', red: 'Red card', sub: 'Substitution',
    var: 'VAR check', goalCancelled: 'Goal cancelled', missedPen: 'Penalty missed',
    first: '1st half', second: '2nd half', halftime: 'Half time', ended: 'Full time', extra: 'Extra time', break: 'Break', shootout: 'Penalties', pre: 'Kick-off', stopped: 'Suspended',
    kickoffIn: 'Kick-off in', startingSoon: 'Starting soon',
    stats: 'Match stats', possession: 'Possession', shots: 'Shots', shotsOnTarget: 'On target', corners: 'Corners', fouls: 'Fouls', offsides: 'Offsides', saves: 'Saves', passAccuracy: 'Pass accuracy', xg: 'Expected goals', yellowCards: 'Yellow cards',
    table: 'League table', pos: 'Pos', team: 'Team', played: 'P', gd: 'GD', pts: 'Pts',
    lineups: 'Lineups', coach: 'Coach', ratings: 'Player ratings', other: 'Other matches', noOther: 'No other live matches right now',
    pressure: 'Pressure index', pressureEmpty: 'Builds as the match goes on', radar: 'Match flow', radarNote: 'Illustrated from match data',
    attack: 'Attack', danger: 'Dangerous attack', corner: 'Corner', shot: 'Shot', shotOn: 'Shot on target', offside: 'Offside', foul: 'Foul', ball: 'In possession',
    shootoutTitle: 'Penalty shootout', bracket: 'Knockout stage', follow: 'Follow us', presentedBy: 'Presented by', final: 'Final score', scorers: 'Scorers', venue: 'Venue', referee: 'Referee', waitingData: 'Waiting for match data',
    camera: 'Your camera',
  },
  fr: {
    og: 'CSC', goal: 'But', ownGoal: 'Contre son camp', penaltyGoal: 'Penalty', yellow: 'Carton jaune', red: 'Carton rouge', sub: 'Remplacement',
    var: 'Vérification VAR', goalCancelled: 'But refusé', missedPen: 'Penalty manqué',
    first: '1re mi-temps', second: '2e mi-temps', halftime: 'Mi-temps', ended: 'Terminé', extra: 'Prolongation', break: 'Pause', shootout: 'Tirs au but', pre: 'Coup d’envoi', stopped: 'Interrompu',
    kickoffIn: 'Coup d’envoi dans', startingSoon: 'On commence bientôt',
    stats: 'Statistiques', possession: 'Possession', shots: 'Tirs', shotsOnTarget: 'Tirs cadrés', corners: 'Corners', fouls: 'Fautes', offsides: 'Hors-jeu', saves: 'Arrêts', passAccuracy: 'Passes réussies', xg: 'Buts attendus', yellowCards: 'Cartons jaunes',
    table: 'Classement', pos: 'Pos', team: 'Équipe', played: 'J', gd: 'Diff', pts: 'Pts',
    lineups: 'Compositions', coach: 'Entraîneur', ratings: 'Notes des joueurs', other: 'Autres matchs', noOther: 'Aucun autre match en direct',
    pressure: 'Indice de pression', pressureEmpty: 'Se construit au fil du match', radar: 'Physionomie du match', radarNote: 'Illustration à partir des données du match',
    attack: 'Attaque', danger: 'Attaque dangereuse', corner: 'Corner', shot: 'Tir', shotOn: 'Tir cadré', offside: 'Hors-jeu', foul: 'Faute', ball: 'Possession',
    shootoutTitle: 'Séance de tirs au but', bracket: 'Phase finale', follow: 'Suivez-nous', presentedBy: 'Présenté par', final: 'Score final', scorers: 'Buteurs', venue: 'Stade', referee: 'Arbitre', waitingData: 'En attente des données du match',
    camera: 'Ta caméra',
  },
  es: {
    og: 'PP', goal: 'Gol', ownGoal: 'Gol en propia', penaltyGoal: 'Penalti', yellow: 'Tarjeta amarilla', red: 'Tarjeta roja', sub: 'Cambio',
    var: 'Revisión VAR', goalCancelled: 'Gol anulado', missedPen: 'Penalti fallado',
    first: '1.ª parte', second: '2.ª parte', halftime: 'Descanso', ended: 'Final', extra: 'Prórroga', break: 'Pausa', shootout: 'Penaltis', pre: 'Saque inicial', stopped: 'Suspendido',
    kickoffIn: 'Empieza en', startingSoon: 'Empezamos pronto',
    stats: 'Estadísticas', possession: 'Posesión', shots: 'Tiros', shotsOnTarget: 'A puerta', corners: 'Córners', fouls: 'Faltas', offsides: 'Fueras de juego', saves: 'Paradas', passAccuracy: 'Precisión de pase', xg: 'Goles esperados', yellowCards: 'Amarillas',
    table: 'Clasificación', pos: 'Pos', team: 'Equipo', played: 'PJ', gd: 'DG', pts: 'Pts',
    lineups: 'Alineaciones', coach: 'Entrenador', ratings: 'Notas de jugadores', other: 'Otros partidos', noOther: 'No hay otros partidos en directo',
    pressure: 'Índice de presión', pressureEmpty: 'Se construye durante el partido', radar: 'Desarrollo del partido', radarNote: 'Ilustración a partir de datos del partido',
    attack: 'Ataque', danger: 'Ataque peligroso', corner: 'Córner', shot: 'Tiro', shotOn: 'Tiro a puerta', offside: 'Fuera de juego', foul: 'Falta', ball: 'En posesión',
    shootoutTitle: 'Tanda de penaltis', bracket: 'Eliminatorias', follow: 'Síguenos', presentedBy: 'Presentado por', final: 'Resultado final', scorers: 'Goleadores', venue: 'Estadio', referee: 'Árbitro', waitingData: 'Esperando datos del partido',
    camera: 'Tu cámara',
  },
  pt: {
    og: 'AG', goal: 'Golo', ownGoal: 'Autogolo', penaltyGoal: 'Penálti', yellow: 'Cartão amarelo', red: 'Cartão vermelho', sub: 'Substituição',
    var: 'Verificação VAR', goalCancelled: 'Golo anulado', missedPen: 'Penálti falhado',
    first: '1.ª parte', second: '2.ª parte', halftime: 'Intervalo', ended: 'Fim do jogo', extra: 'Prolongamento', break: 'Pausa', shootout: 'Penáltis', pre: 'Pontapé de saída', stopped: 'Suspenso',
    kickoffIn: 'Começa em', startingSoon: 'Começamos em breve',
    stats: 'Estatísticas', possession: 'Posse de bola', shots: 'Remates', shotsOnTarget: 'À baliza', corners: 'Cantos', fouls: 'Faltas', offsides: 'Foras de jogo', saves: 'Defesas', passAccuracy: 'Passes certos', xg: 'Golos esperados', yellowCards: 'Amarelos',
    table: 'Classificação', pos: 'Pos', team: 'Equipa', played: 'J', gd: 'DG', pts: 'Pts',
    lineups: 'Onzes', coach: 'Treinador', ratings: 'Notas dos jogadores', other: 'Outros jogos', noOther: 'Sem outros jogos em direto',
    pressure: 'Índice de pressão', pressureEmpty: 'Constrói-se ao longo do jogo', radar: 'Desenrolar do jogo', radarNote: 'Ilustração a partir dos dados do jogo',
    attack: 'Ataque', danger: 'Ataque perigoso', corner: 'Canto', shot: 'Remate', shotOn: 'Remate à baliza', offside: 'Fora de jogo', foul: 'Falta', ball: 'Com a bola',
    shootoutTitle: 'Desempate por penáltis', bracket: 'Fase a eliminar', follow: 'Segue-nos', presentedBy: 'Apresentado por', final: 'Resultado final', scorers: 'Marcadores', venue: 'Estádio', referee: 'Árbitro', waitingData: 'À espera dos dados do jogo',
    camera: 'A tua câmara',
  },
};

export function translator(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  return (key) => table[key] ?? STRINGS.en[key] ?? key;
}
