"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import {
  UserStats,
  Badge,
  calculateLevel,
  calculateCheckinXp,
  checkBadgeUnlocks,
  XP_REWARDS,
  isDailyGoalMet,
} from "./gamification";

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
  const { user, loading: authLoading } = useAuth();
  // Only use the actual user ID, never fallback to demo-user for stats
  const userId = user?.id;

  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    // Wait for auth to finish loading and ensure we have a real user
    if (authLoading) {
      console.log("[useUserStats] Auth still loading, waiting...");
      return;
    }

    if (!userId) {
      console.log("[useUserStats] No userId, returning empty stats");
      setStats({
        id: "",
        user_id: "none",
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

    console.log("[useUserStats] Fetching stats for userId:", userId);

    try {
      setLoading(true);

      // Fetch REAL stats from experiment_checkins and experiments
      // First get all experiment IDs for this user
      const { data: userExperiments } = await supabase
        .from("experiments")
        .select("id, status")
        .eq("user_id", userId);

      console.log("[useUserStats] Found experiments:", userExperiments?.length || 0);

      const userExperimentIds = (userExperiments || []).map(e => e.id);
      const achievedExperiments = (userExperiments || []).filter(e => e.status === "achieved");

      // If no experiments, return empty stats
      if (userExperimentIds.length === 0) {
        const emptyStats: UserStats = {
          id: "",
          user_id: userId,
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
        };
        setStats(emptyStats);
        setError(null);
        setLoading(false);
        return;
      }

      // Now get checkins only for this user's experiments
      const { data: checkinsData } = await supabase
        .from("experiment_checkins")
        .select("id, status, created_at")
        .eq("status", "done")
        .in("experiment_id", userExperimentIds);

      const completedCheckins = (checkinsData || []) as Array<{ id: string; status: string; created_at: string }>;
      const completedProjects = achievedExperiments as Array<{ id: string; status: string }>;

      // Calculate total checkins (completed steps)
      const totalCheckins = completedCheckins.length;

      // Calculate projects completed
      const totalProjectsCompleted = completedProjects.length;

      // Calculate XP based on real data
      // Base: 10 XP per completed step + 100 XP per completed project
      const xp = (totalCheckins * XP_REWARDS.CHECKIN) + (totalProjectsCompleted * XP_REWARDS.PROJECT_COMPLETED);
      const level = calculateLevel(xp);

      // Calculate streak from checkin dates
      const checkinDates = completedCheckins
        .map(c => c.created_at?.split("T")[0])
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a)); // Most recent first

      let streakDays = 0;
      let lastCheckinDate: string | null = null;

      if (checkinDates.length > 0) {
        lastCheckinDate = checkinDates[0];
        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

        // Only count streak if last checkin was today or yesterday
        if (lastCheckinDate === today || lastCheckinDate === yesterday) {
          streakDays = 1;
          let checkDate = lastCheckinDate === today ? yesterday : new Date(new Date(lastCheckinDate).getTime() - 86400000).toISOString().split("T")[0];

          // Count consecutive days backwards
          const uniqueDates = [...new Set(checkinDates)];
          for (let i = 1; i < uniqueDates.length; i++) {
            if (uniqueDates.includes(checkDate)) {
              streakDays++;
              checkDate = new Date(new Date(checkDate).getTime() - 86400000).toISOString().split("T")[0];
            } else {
              break;
            }
          }
        }
      }

      // Calculate daily checkins (today)
      const today = new Date().toISOString().split("T")[0];
      const dailyCheckins = completedCheckins.filter(c => c.created_at?.startsWith(today)).length;

      // Try to get saved badges from user_stats, but use real data for everything else
      let badges: Badge[] = [];
      try {
        const { data: savedStats } = await supabase
          .from("user_stats")
          .select("badges")
          .eq("user_id", userId)
          .single();

        if (savedStats?.badges && Array.isArray(savedStats.badges)) {
          badges = savedStats.badges;
        }
      } catch {
        // Ignore badge fetch errors - they're not critical
      }

      const realStats: UserStats = {
        id: "",
        user_id: userId,
        xp,
        level,
        streak_days: streakDays,
        longest_streak: streakDays, // Simplified - would need historical data for accurate longest
        last_checkin_date: lastCheckinDate,
        daily_checkins: dailyCheckins,
        daily_goal: 2,
        total_checkins: totalCheckins,
        total_projects_completed: totalProjectsCompleted,
        badges,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setStats(realStats);
      setError(null);
    } catch (err) {
      console.error("Error fetching user stats:", err);
      setError("Error al cargar estadísticas");
      // Still set default stats so UI works
      setStats({
        id: "",
        user_id: userId,
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
  }, [userId, authLoading]);

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
      if (!stats || !userId) return null;

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
            user_id: userId,
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
          .eq("user_id", userId);

        if (updateError) {
          console.error("Error updating user stats:", updateError);
          // Continue anyway, the UI will still update
        }

        // Record XP event
        await supabase.from("xp_events").insert({
          user_id: userId,
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
    [stats, userId]
  );

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
    recordCheckin,
  };
}
