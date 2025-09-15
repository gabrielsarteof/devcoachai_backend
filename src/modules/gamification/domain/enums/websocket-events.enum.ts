export enum GamificationEvents {
  XP_AWARDED = 'gamification:xp_awarded',
  LEVEL_UP = 'gamification:level_up',
  BADGE_UNLOCKED = 'gamification:badge_unlocked',
  STREAK_UPDATE = 'gamification:streak_update',
  NOTIFICATION = 'gamification:notification',
  DASHBOARD_UPDATE = 'gamification:dashboard_update',
  
  SUBSCRIBE_UPDATES = 'gamification:subscribe_updates',
  GET_DASHBOARD = 'gamification:get_dashboard',
  ACKNOWLEDGE_NOTIFICATION = 'gamification:ack_notification',
}