"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import {
  UserStats,
  Badge,
  calculateLevel,
  calculateCheckinXp,
  checkBadgeUnlocks,
  XP_REWARDS,
  isDailyGoalMet,
} from "./gamification";

const DEFAULT_USER_ID = "demo-user";

interface UseUserStatsReturn {
  stats: UserStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  recordCheckin: (experimentId: string) => Promise<{
    xpGained: number;
    newBadges: Badge[];
    levelUp: boolean;
    dailyGoalMet: boolean;
  } | null>;
}

export function useUserStats(): UseUserStatsReturn {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("user_stats")
        .select("*")
        .eq("user_id", DEFAULT_USER_ID)
        .single();

      if (fetchError) {
        // Table might not exist yet or no row found - create default stats
        // PGRST116 = no rows returned, 42P01 = table doesn't exist
        console.warn("useUserStats fetch error:", fetchError.code, fetchError.message);
        setStats({
          id: "",
          user_id: DEFAULT_USER_ID,
          xp: 0,
          level: 1,
          streak_days: 0,
          longest_streak: 0,
          last_checkin_date: null,
          daily_checkins: 0,
          daily_goal: 2,
          total_checkins: 0,
          total_projects_completed: 0,
          badges: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setLoading(false);
        return;
      }

      // Parse badges from JSON if needed
      const parsedStats: UserStats = {
        ...data,
        badges: Array.isArray(data.badges) ? data.badges : [],
      };

      // Reset daily checkins if it's a new day
      const today = new Date().toISOString().split("T")[0];
      if (parsedStats.last_checkin_date !== today) {
        parsedStats.daily_checkins = 0;
      }

      setStats(parsedStats);
      setError(null);
    } catch (err) {
      console.error("Error fetching user stats:", err);
      setError("Error al cargar estadísticas");
      // Still set default stats so UI works
      setStats({
        id: "",
        user_id: DEFAULT_USER_ID,
        xp: 0,
        level: 1,
        streak_days: 0,
        longest_streak: 0,
        last_checkin_date: null,
        daily_checkins: 0,
        daily_goal: 2,
        total_checkins: 0,
        total_projects_completed: 0,
        badges: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const recordCheckin = useCallback(
    async (experimentId: string): Promise<{
      xpGained: number;
      newBadges: Badge[];
      levelUp: boolean;
      dailyGoalMet: boolean;
    } | null> => {
      if (!stats) return null;

      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const currentHour = now.getHours();

      // Calculate if this is first check-in of the day
      const isNewDay = stats.last_checkin_date !== today;

      // Calculate new streak
      let newStreak = stats.streak_days;
      if (isNewDay) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        if (stats.last_checkin_date === yesterdayStr) {
          // Continue streak
          newStreak = stats.streak_days + 1;
        } else if (!stats.last_checkin_date || stats.last_checkin_date < yesterdayStr) {
          // Streak broken, start fresh
          newStreak = 1;
        }
      }

      // Calculate XP gained
      let xpGained = calculateCheckinXp(newStreak, isNewDay);

      // Daily goal bonus
      const newDailyCheckins = isNewDay ? 1 : stats.daily_checkins + 1;
      const wasGoalMet = isDailyGoalMet(stats.daily_checkins, stats.daily_goal);
      const isGoalNowMet = isDailyGoalMet(newDailyCheckins, stats.daily_goal);

      if (!wasGoalMet && isGoalNowMet) {
        xpGained += XP_REWARDS.DAILY_GOAL_MET;
      }

      // Calculate new totals
      const newTotalCheckins = stats.total_checkins + 1;
      const newXp = stats.xp + xpGained;
      const newLevel = calculateLevel(newXp);
      const levelUp = newLevel > stats.level;
      const newLongestStreak = Math.max(stats.longest_streak, newStreak);

      // Prepare updated stats for badge check
      const updatedStats: UserStats = {
        ...stats,
        xp: newXp,
        level: newLevel,
        streak_days: newStreak,
        longest_streak: newLongestStreak,
        last_checkin_date: today,
        daily_checkins: newDailyCheckins,
        total_checkins: newTotalCheckins,
      };

      // Check for new badges
      const newBadges = checkBadgeUnlocks(updatedStats, currentHour);

      // Add XP for new badges
      if (newBadges.length > 0) {
        xpGained += newBadges.length * XP_REWARDS.BADGE_UNLOCKED;
        updatedStats.xp += newBadges.length * XP_REWARDS.BADGE_UNLOCKED;
        updatedStats.level = calculateLevel(updatedStats.xp);
      }

      // Merge badges
      const allBadges = [...stats.badges, ...newBadges];

      try {
        // Update user_stats in database
        const { error: updateError } = await supabase
          .from("user_stats")
          .upsert({
            user_id: DEFAULT_USER_ID,
            xp: updatedStats.xp,
            level: updatedStats.level,
            streak_days: newStreak,
            longest_streak: newLongestStreak,
            last_checkin_date: today,
            daily_checkins: newDailyCheckins,
            total_checkins: newTotalCheckins,
            badges: allBadges,
            updated_at: now.toISOString(),
          })
          .eq("user_id", DEFAULT_USER_ID);

        if (updateError) {
          console.error("Error updating user stats:", updateError);
          // Continue anyway, the UI will still update
        }

        // Record XP event
        await supabase.from("xp_events").insert({
          user_id: DEFAULT_USER_ID,
          amount: xpGained,
          reason: "checkin",
          experiment_id: experimentId,
        });

        // Update local state
        setStats({
          ...updatedStats,
          badges: allBadges,
        });

        return {
          xpGained,
          newBadges,
          levelUp: newLevel > stats.level,
          dailyGoalMet: !wasGoalMet && isGoalNowMet,
        };
      } catch (err) {
        console.error("Error recording checkin:", err);
        return null;
      }
    },
    [stats]
  );

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
    recordCheckin,
  };
}
