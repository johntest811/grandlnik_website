"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/Clients/Supabase/SupabaseClients";
import { userNotificationService } from "@/utils/userNotificationService";

interface NotificationPreferences {
  new_product_notifications: boolean;
  stock_update_notifications: boolean;
  order_status_notifications: boolean;
  email_notifications: boolean;
}

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  action_url?: string;
  metadata?: any;
}

export default function ProfileNotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    new_product_notifications: true,
    stock_update_notifications: true,
    order_status_notifications: true,
    email_notifications: true
  });

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchUserAndPreferences();
  }, []);

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
    }
  }, [user, page]);

  async function fetchUserAndPreferences() {
    try {
      const { data: { user: userData } } = await supabase.auth.getUser();
      
      if (!userData) {
        router.push('/login');
        return;
      }

      setUser(userData);

      // Fetch user preferences
      const result = await userNotificationService.getUserPreferences(userData.id);
      
      if (result.success && result.preferences) {
        setPreferences({
          new_product_notifications: result.preferences.new_product_notifications ?? true,
          stock_update_notifications: result.preferences.stock_update_notifications ?? true,
          order_status_notifications: result.preferences.order_status_notifications ?? true,
          email_notifications: result.preferences.email_notifications ?? true
        });
      }
    } catch (error) {
      console.error("Error fetching user and preferences:", error);
      showToast('error', 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }

  async function fetchNotifications() {
    if (!user?.id || loadingNotifications) return;

    setLoadingNotifications(true);
    try {
      const result = await userNotificationService.getUserNotifications(user.id, page, 20);
      
      if (result.success && result.notifications) {
        if (page === 1) {
          setNotifications(result.notifications);
        } else {
          setNotifications(prev => [...prev, ...result.notifications]);
        }
        setHasMore(result.has_more || false);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoadingNotifications(false);
    }
  }

  async function handlePreferenceChange(key: keyof NotificationPreferences, value: boolean) {
    if (!user?.id) return;

    setPreferences(prev => ({ ...prev, [key]: value }));

    setSaving(true);
    try {
      const result = await userNotificationService.updateUserPreferences(user.id, {
        [key]: value
      });

      if (result.success) {
        showToast('success', 'Preferences updated successfully');
      } else {
        showToast('error', 'Failed to update preferences');
        setPreferences(prev => ({ ...prev, [key]: !value }));
      }
    } catch (error) {
      console.error("Error updating preferences:", error);
      showToast('error', 'Failed to update preferences');
      setPreferences(prev => ({ ...prev, [key]: !value }));
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkAsRead(notificationId: number) {
    if (!user?.id) return;

    try {
      const result = await userNotificationService.markNotificationAsRead(notificationId, user.id);
      
      if (result.success) {
        setNotifications(prev =>
          prev.map(notif =>
            notif.id === notificationId ? { ...notif, is_read: true } : notif
          )
        );
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }

  async function handleDeleteNotification(notificationId: number) {
    if (!user?.id) return;

    try {
      const result = await userNotificationService.deleteNotification(notificationId, user.id);
      
      if (result.success) {
        setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
        showToast('success', 'Notification deleted');
      } else {
        showToast('error', 'Failed to delete notification');
      }
    } catch (error) {
      console.error("Error deleting notification:", error);
      showToast('error', 'Failed to delete notification');
    }
  }

  async function handleNotificationClick(notification: Notification) {
    if (!notification.is_read) {
      await handleMarkAsRead(notification.id);
    }

    if (notification.action_url) {
      router.push(notification.action_url);
    }
  }

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_product':
        return '🆕';
      case 'stock_update':
        return '📦';
      case 'order_status':
        return '📋';
      default:
        return '🔔';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1C1C] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Toast Notification */}
        {toast && (
          <div className={`fixed top-20 right-4 z-50 ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          } text-white px-6 py-3 rounded-lg shadow-lg animate-slide-in`}>
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Notification Settings</h1>
          <p className="text-gray-600">Manage your notification preferences and view your notification history</p>
        </div>

        {/* Notification Preferences Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">⚙️</span>
            Notification Preferences
          </h2>
          
          <div className="space-y-4">
            {/* New Product Notifications */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">🆕 New Product Notifications</h3>
                <p className="text-sm text-gray-500">Get notified when new products are added</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-4">
                <input
                  type="checkbox"
                  checked={preferences.new_product_notifications}
                  onChange={(e) => handlePreferenceChange('new_product_notifications', e.target.checked)}
                  disabled={saving}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Stock Update Notifications */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">📦 Stock Update Notifications</h3>
                <p className="text-sm text-gray-500">Get notified when products are back in stock</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-4">
                <input
                  type="checkbox"
                  checked={preferences.stock_update_notifications}
                  onChange={(e) => handlePreferenceChange('stock_update_notifications', e.target.checked)}
                  disabled={saving}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Order Status Notifications */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">📋 Order Status Notifications</h3>
                <p className="text-sm text-gray-500">Get updates about your order status</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-4">
                <input
                  type="checkbox"
                  checked={preferences.order_status_notifications}
                  onChange={(e) => handlePreferenceChange('order_status_notifications', e.target.checked)}
                  disabled={saving}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Email Notifications */}
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">📧 Email Notifications</h3>
                <p className="text-sm text-gray-500">Receive notifications via email</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-4">
                <input
                  type="checkbox"
                  checked={preferences.email_notifications}
                  onChange={(e) => handlePreferenceChange('email_notifications', e.target.checked)}
                  disabled={saving}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Notification History Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">📜</span>
            Notification History
          </h2>

          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🔔</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No notifications yet</h3>
              <p className="text-gray-500">You'll see notifications here when they arrive</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    notification.is_read ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'
                  } hover:shadow-md`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start flex-1">
                      <span className="text-2xl mr-3">{getNotificationIcon(notification.type)}</span>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-1">{notification.title}</h4>
                        <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                        <p className="text-xs text-gray-400">{formatDate(notification.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      {!notification.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notification.id);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                          title="Mark as read"
                        >
                          ✓
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNotification(notification.id);
                        }}
                        className="text-red-600 hover:text-red-800 text-xs"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {loadingNotifications && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                </div>
              )}
              {hasMore && !loadingNotifications && (
                <button
                  onClick={() => setPage(prev => prev + 1)}
                  className="w-full py-2 text-blue-600 hover:text-blue-800 font-medium"
                >
                  Load More
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
