import { createClient } from "@supabase/supabase-js";

// Use the public anon key for client-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const userNotificationService = {
  // Get user notifications (client-side safe)
  async getUserNotifications(userId: string, page: number = 1, limit: number = 10) {
    try {
      const offset = (page - 1) * limit;

      // Get total count
      const { count, error: countError } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) {
        console.error("Error counting notifications:", countError);
        return { success: false, error: countError, notifications: [], total: 0, unread_count: 0 };
      }

      // Get notifications
      const { data: notifications, error } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching notifications:", error);
        return { success: false, error, notifications: [], total: 0, unread_count: 0 };
      }

      // Get unread count
      const { count: unreadCount, error: unreadError } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      return {
        success: true,
        notifications: notifications || [],
        total: count || 0,
        unread_count: unreadCount || 0,
        has_more: count ? offset + limit < count : false
      };
    } catch (error) {
      console.error("Error in getUserNotifications:", error);
      return { success: false, error, notifications: [], total: 0, unread_count: 0 };
    }
  },

  // Mark notification as read (client-side safe)
  async markNotificationAsRead(notificationId: number, userId: string) {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId);

      if (error) {
        console.error("Error marking notification as read:", error);
        return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      console.error("Error in markNotificationAsRead:", error);
      return { success: false, error };
    }
  },

  // Mark all notifications as read (client-side safe)
  async markAllNotificationsAsRead(userId: string) {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        console.error("Error marking all notifications as read:", error);
        return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      console.error("Error in markAllNotificationsAsRead:", error);
      return { success: false, error };
    }
  },

  // Delete notification (client-side safe)
  async deleteNotification(notificationId: number, userId: string) {
    try {
      const { error } = await supabase
        .from('user_notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', userId);

      if (error) {
        console.error("Error deleting notification:", error);
        return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      console.error("Error in deleteNotification:", error);
      return { success: false, error };
    }
  },

  // Get user notification preferences (client-side safe)
  async getUserPreferences(userId: string) {
    try {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // If no preferences exist, initialize them
        if (error.code === 'PGRST116') {
          return this.initializeUserPreferences(userId);
        }
        console.error("Error fetching preferences:", error);
        return { success: false, error, preferences: null };
      }

      return { success: true, preferences: data };
    } catch (error) {
      console.error("Error in getUserPreferences:", error);
      return { success: false, error, preferences: null };
    }
  },

  // Update user notification preferences (client-side safe)
  async updateUserPreferences(userId: string, preferences: {
    new_product_notifications?: boolean;
    stock_update_notifications?: boolean;
    order_status_notifications?: boolean;
    email_notifications?: boolean;
  }) {
    try {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .update({
          ...preferences,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error("Error updating preferences:", error);
        return { success: false, error };
      }

      return { success: true, preferences: data };
    } catch (error) {
      console.error("Error in updateUserPreferences:", error);
      return { success: false, error };
    }
  },

  // Initialize user notification preferences (client-side safe)
  async initializeUserPreferences(userId: string) {
    try {
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .insert({
          user_id: userId,
          new_product_notifications: true,
          stock_update_notifications: true,
          order_status_notifications: true,
          email_notifications: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error("Error initializing preferences:", error);
        return { success: false, error, preferences: null };
      }

      return { success: true, preferences: data };
    } catch (error) {
      console.error("Error in initializeUserPreferences:", error);
      return { success: false, error, preferences: null };
    }
  }
};

// Server-side functions that use service role key - these will be called via API routes
export const serverNotificationService = {
  // Send new product notification to all users who want them
  async notifyNewProduct(productName: string, productId: string, adminName: string) {
    // This will be called via API route
    const response = await fetch('/api/admin-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'new_product',
        data: {
          product_name: productName,
          product_id: productId
        },
        adminName,
      })
    });
    
    return await response.json();
  },

  // Send stock update notification
  async notifyStockUpdate(productName: string, productId: string, newStock: number, adminName: string) {
    // This will be called via API route
    const response = await fetch('/api/admin-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'stock_update',
        data: {
          product_name: productName,
          product_id: productId,
          new_stock: newStock
        },
        adminName,
      })
    });
    
    return await response.json();
  },

  // Send order status update notification
  async notifyOrderStatusUpdate(userId: string, orderDetails: any, newStatus: string, adminName: string) {
    // This will be called via API route
    const response = await fetch('/api/update-order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userItemId: orderDetails.id,
        newStatus,
        adminName,
        adminNotes: orderDetails.admin_notes
      })
    });
    
    return await response.json();
  }
};