// ============================================
// GAMIFICATION SYSTEM
// XP, Levels, Streaks, and Badges
// ============================================

// XP rewards for different actions
export const XP_REWARDS = {
  CHECKIN: 10, // Base XP per check-in
  STREAK_BONUS: 5, // Extra XP per streak day (multiplier)
  DAILY_GOAL_MET: 25, // Bonus for meeting daily goal
  PROJECT_COMPLETED: 100, // Completing a project
  BADGE_UNLOCKED: 50, // Unlocking a new badge
} as const;

// Level thresholds (XP needed for each level)
export const LEVEL_THRESHOLDS = [
  0, // Level 1
  50, // Level 2
  150, // Level 3
  300, // Level 4
  500, // Level 5
  750, // Level 6
  1050, // Level 7
  1400, // Level 8
  1800, // Level 9
  2250, // Level 10
  2750, // Level 11
  3300, // Level 12
  3900, // Level 13
  4550, // Level 14
  5250, // Level 15
  6000, // Level 16
  6800, // Level 17
  7650, // Level 18
  8550, // Level 19
  9500, // Level 20
];

// Badge definitions
export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: string; // Human-readable condition
  unlockedAt?: string; // ISO date when unlocked
}

export const BADGE_DEFINITIONS: Omit<Badge, "unlockedAt">[] = [
  // Streak badges
  {
    id: "streak_3",
    name: "En racha",
    description: "3 días seguidos avanzando",
    icon: "🔥",
    condition: "streak >= 3",
  },
  {
    id: "streak_7",
    name: "Semana perfecta",
    description: "7 días seguidos avanzando",
    icon: "⭐",
    condition: "streak >= 7",
  },
  {
    id: "streak_14",
    name: "Imparable",
    description: "14 días seguidos avanzando",
    icon: "💪",
    condition: "streak >= 14",
  },
  {
    id: "streak_30",
    name: "Máquina",
    description: "30 días seguidos avanzando",
    icon: "🏆",
    condition: "streak >= 30",
  },
  // Check-in milestones
  {
    id: "checkins_10",
    name: "Primeros pasos",
    description: "10 avances registrados",
    icon: "👣",
    condition: "total_checkins >= 10",
  },
  {
    id: "checkins_50",
    name: "Constante",
    description: "50 avances registrados",
    icon: "📈",
    condition: "total_checkins >= 50",
  },
  {
    id: "checkins_100",
    name: "Centenario",
    description: "100 avances registrados",
    icon: "💯",
    condition: "total_checkins >= 100",
  },
  // Project completion
  {
    id: "first_project",
    name: "Primer logro",
    description: "Completar tu primer proyecto",
    icon: "🎯",
    condition: "projects_completed >= 1",
  },
  {
    id: "projects_5",
    name: "Ejecutor",
    description: "Completar 5 proyectos",
    icon: "🚀",
    condition: "projects_completed >= 5",
  },
  // Level badges
  {
    id: "level_5",
    name: "Aprendiz",
    description: "Alcanzar nivel 5",
    icon: "🌱",
    condition: "level >= 5",
  },
  {
    id: "level_10",
    name: "Experto",
    description: "Alcanzar nivel 10",
    icon: "🌟",
    condition: "level >= 10",
  },
  // Special badges
  {
    id: "early_bird",
    name: "Madrugador",
    description: "Hacer check-in antes de las 9am",
    icon: "🌅",
    condition: "checkin_before_9am",
  },
  {
    id: "night_owl",
    name: "Noctámbulo",
    description: "Hacer check-in después de las 10pm",
    icon: "🦉",
    condition: "checkin_after_10pm",
  },
];

// User stats interface
export interface UserStats {
  id: string;
  user_id: string;
  xp: number;
  level: number;
  streak_days: number;
  longest_streak: number;
  last_checkin_date: string | null;
  daily_checkins: number;
  daily_goal: number;
  total_checkins: number;
  total_projects_completed: number;
  badges: Badge[];
  created_at: string;
  updated_at: string;
}

// Calculate level from XP
export function calculateLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

// Get XP needed for next level
export function getXpForNextLevel(currentXp: number): { current: number; needed: number; progress: number } {
  const level = calculateLevel(currentXp);
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];

  const xpInLevel = currentXp - currentThreshold;
  const xpNeeded = nextThreshold - currentThreshold;
  const progress = Math.min(100, (xpInLevel / xpNeeded) * 100);

  return { current: xpInLevel, needed: xpNeeded, progress };
}

// Calculate XP earned for a check-in
export function calculateCheckinXp(streakDays: number, isFirstOfDay: boolean): number {
  let xp = XP_REWARDS.CHECKIN;

  // Streak bonus (capped at 50 extra XP)
  if (streakDays > 1) {
    xp += Math.min(streakDays * XP_REWARDS.STREAK_BONUS, 50);
  }

  return xp;
}

// Check which badges should be unlocked
export function checkBadgeUnlocks(
  stats: UserStats,
  checkinHour?: number
): Badge[] {
  const newBadges: Badge[] = [];
  const existingBadgeIds = new Set(stats.badges.map((b) => b.id));
  const now = new Date().toISOString();

  for (const badgeDef of BADGE_DEFINITIONS) {
    if (existingBadgeIds.has(badgeDef.id)) continue;

    let shouldUnlock = false;

    switch (badgeDef.id) {
      // Streak badges
      case "streak_3":
        shouldUnlock = stats.streak_days >= 3;
        break;
      case "streak_7":
        shouldUnlock = stats.streak_days >= 7;
        break;
      case "streak_14":
        shouldUnlock = stats.streak_days >= 14;
        break;
      case "streak_30":
        shouldUnlock = stats.streak_days >= 30;
        break;

      // Check-in milestones
      case "checkins_10":
        shouldUnlock = stats.total_checkins >= 10;
        break;
      case "checkins_50":
        shouldUnlock = stats.total_checkins >= 50;
        break;
      case "checkins_100":
        shouldUnlock = stats.total_checkins >= 100;
        break;

      // Project completion
      case "first_project":
        shouldUnlock = stats.total_projects_completed >= 1;
        break;
      case "projects_5":
        shouldUnlock = stats.total_projects_completed >= 5;
        break;

      // Level badges
      case "level_5":
        shouldUnlock = stats.level >= 5;
        break;
      case "level_10":
        shouldUnlock = stats.level >= 10;
        break;

      // Time-based badges
      case "early_bird":
        shouldUnlock = checkinHour !== undefined && checkinHour < 9;
        break;
      case "night_owl":
        shouldUnlock = checkinHour !== undefined && checkinHour >= 22;
        break;
    }

    if (shouldUnlock) {
      newBadges.push({ ...badgeDef, unlockedAt: now });
    }
  }

  return newBadges;
}

// Format level name
export function getLevelName(level: number): string {
  if (level <= 2) return "Novato";
  if (level <= 4) return "Aprendiz";
  if (level <= 6) return "Explorador";
  if (level <= 8) return "Practicante";
  if (level <= 10) return "Experto";
  if (level <= 12) return "Veterano";
  if (level <= 14) return "Maestro";
  if (level <= 16) return "Leyenda";
  if (level <= 18) return "Campeón";
  return "Élite";
}

// Check if today's goal is met
export function isDailyGoalMet(dailyCheckins: number, dailyGoal: number): boolean {
  return dailyCheckins >= dailyGoal;
}

// Calculate streak status
export function getStreakStatus(
  lastCheckinDate: string | null,
  currentStreakDays: number
): { isActive: boolean; daysUntilLost: number } {
  if (!lastCheckinDate) {
    return { isActive: false, daysUntilLost: 0 };
  }

  const last = new Date(lastCheckinDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Checked in today
    return { isActive: true, daysUntilLost: 1 };
  } else if (diffDays === 1) {
    // Last check-in was yesterday, streak still active but need to check in today
    return { isActive: true, daysUntilLost: 0 };
  } else {
    // Streak is broken
    return { isActive: false, daysUntilLost: 0 };
  }
}
