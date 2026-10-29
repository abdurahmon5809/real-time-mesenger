import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io.connect('http://localhost:3001');

const emojiList = ['😀', '😂', '😍', '👍', '❤️', '🔥', '🎉', '😎', '🙏', '👏'];

const translations = {
  uz: {
    settings: 'Sozlamalar',
    profile: 'Profil',
    bio: 'Bio:',
    changeAvatar: 'Profil rasmini o\'zgartirish',
    changeUsername: 'Foydalanuvchi nomi',
    theme: 'Mavzu:',
    language: 'Til:',
    notifications: 'Bildirishnomalar:',
    soundEnabled: 'Yoqilgan 🔔',
    soundDisabled: 'O\'chirilgan 🔕',
    darkTheme: 'Tungi rejim 🌙',
    lightTheme: 'Kunduzgi rejim ☀️',
    save: 'Saqlash',
    close: 'Yopish',
    search: 'Qidiruv...',
    typeMessage: 'Xabar yuborish...',
    selectChatHint: 'Suhbatlashish uchun chat yoki guruhni tanlang',
    online: 'online',
    offline: 'offline',
    typing: 'yozmoqda...',
    download: 'Yuklab olish',
    chatWallpaper: 'Chat foni:',
    defaultWallpaper: 'Standart',
    doodleWallpaper: 'Telegram Naqsh',
    edited: 'tahrirlangan',
    delete: 'O\'chirish',
    edit: 'Tahrirlash',
    reply: 'Javob berish',
    logout: 'Akkauntdan chiqish',
    deleteAccount: 'Akkauntdan voz kechish (O\'chirish)',
    accountInfo: 'Hisob ma\'lumotlari',
    createGroup: '➕ Guruh ochish',
    groupName: 'Guruh nomi',
    membersCount: 'a\'zo',
    clearChat: 'Chatni tozalash',
    deleteChat: 'Chatni o\'chirish',
    leaveGroup: 'Guruhdan chiqish',
    deleteGroup: 'Guruhni o\'chirish'
  },
  en: {
    settings: 'Settings',
    profile: 'Profile',
    bio: 'Bio:',
    changeAvatar: 'Change Profile Picture',
    changeUsername: 'Username',
    theme: 'Theme:',
    language: 'Language:',
    notifications: 'Notifications:',
    soundEnabled: 'Enabled 🔔',
    soundDisabled: 'Disabled 🔕',
    darkTheme: 'Dark Mode 🌙',
    lightTheme: 'Light Mode ☀️',
    save: 'Save',
    close: 'Close',
    search: 'Search...',
    typeMessage: 'Write a message...',
    selectChatHint: 'Select a chat or group to start messaging',
    online: 'online',
    offline: 'offline',
    typing: 'typing...',
    download: 'Download',
    chatWallpaper: 'Chat Wallpaper:',
    defaultWallpaper: 'Default',
    doodleWallpaper: 'Telegram Pattern',
    edited: 'edited',
    delete: 'Delete',
    edit: 'Edit',
    reply: 'Reply',
    logout: 'Log Out',
    deleteAccount: 'Delete Account',
    accountInfo: 'Account Info',
    createGroup: '➕ Create Group',
    groupName: 'Group Name',
    membersCount: 'members',
    clearChat: 'Clear Chat',
    deleteChat: 'Delete Chat',
    leaveGroup: 'Leave Group',
    deleteGroup: 'Delete Group'
  }
};

function App() {
  const [username, setUsername] = useState(() => localStorage.getItem('chat_username') || '');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('chat_username'));
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');

  const [allUsers, setAllUsers] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [typingStatus, setTypingStatus] = useState('');

  const [replyingToMsg, setReplyingToMsg] = useState(null);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null);

  const [theme, setTheme] = useState(() => localStorage.getItem('chat_theme') || 'dark');
  const [language, setLanguage] = useState(() => localStorage.getItem('chat_lang') || 'uz');
  const [notifications, setNotifications] = useState(() => localStorage.getItem('chat_notif') !== 'false');
  const [wallpaper, setWallpaper] = useState(() => localStorage.getItem('chat_wp') || 'doodle');
  
  const [hiddenChats, setHiddenChats] = useState(() => {
    const saved = localStorage.getItem('chat_hidden');
    return saved ? JSON.parse(saved) : [];
  });

  const [newUsername, setNewUsername] = useState(username);
  const [bio, setBio] = useState(() => localStorage.getItem('chat_bio') || 'Hey there! I am using Telegram Web Pro.');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('chat_avatar') || '');

  const [activeMedia, setActiveMedia] = useState(null);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const t = translations[language] || translations.uz;

  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      socket.disconnect();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setShowEmojiPicker(false);
        setReactionPickerMsgId(null);
        if (activeMedia) setActiveMedia(null);
        else if (isProfileOpen) setIsProfileOpen(false);
        else if (isSettingsOpen) setIsSettingsOpen(false);
        else if (isCreateGroupOpen) setIsCreateGroupOpen(false);
        else if (editingMsgId) { setEditingMsgId(null); setMessage(''); }
        else if (replyingToMsg) setReplyingToMsg(null);
        else if (activeChat) setActiveChat(null);
      }
    };

    const handleClickOutside = () => {
      setContextMenu(null);
      setReactionPickerMsgId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [activeMedia, isProfileOpen, isSettingsOpen, isCreateGroupOpen, editingMsgId, replyingToMsg, activeChat]);

  useEffect(() => {
    localStorage.setItem('chat_theme', theme);
    localStorage.setItem('chat_lang', language);
    localStorage.setItem('chat_bio', bio);
    localStorage.setItem('chat_avatar', avatar);
    localStorage.setItem('chat_notif', notifications);
    localStorage.setItem('chat_wp', wallpaper);
    localStorage.setItem('chat_hidden', JSON.stringify(hiddenChats));
  }, [theme, language, bio, avatar, notifications, wallpaper, hiddenChats]);

  useEffect(() => {
    if (isLoggedIn && username) {
      socket.emit('join_user', { username, avatar, bio });
    }

    socket.on('update_users_and_groups', ({ users, groups }) => {
      setAllUsers(users);
      setAllGroups(groups);
    });

    socket.on('group_created', (groups) => {
      setAllGroups(groups);
    });

    socket.on('load_history', (history) => {
      setMessages(history);
    });

    socket.on('receive_message', (data) => {
      setHiddenChats(prev => prev.filter(name => name !== data.sender && name !== data.target));
      setMessages((list) => [...list, data]);
      setTypingStatus('');

      if (notifications && data.sender !== username && "Notification" in window && Notification.permission === "granted") {
        new Notification(`${data.sender}`, { body: data.file ? '📎 Fayl yuborildi' : data.text });
      }
    });

    socket.on('display_typing', ({ username: typingUser }) => {
      setTypingStatus(`${typingUser} ${t.typing}`);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setTypingStatus('');
      }, 2000);
    });

    socket.on('chat_deleted', () => {
      setMessages([]);
      setActiveChat(null);
    });

    return () => {
      socket.off('update_users_and_groups');
      socket.off('group_created');
      socket.off('load_history');
      socket.off('receive_message');
      socket.off('display_typing');
      socket.off('chat_deleted');
    };
  }, [isLoggedIn, username, avatar, bio, notifications, t.typing]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAuth = (e) => {
    e.preventDefault();
    setAuthError('');

    if (isRegistering) {
      socket.emit('register', { username, password }, (res) => {
        if (res.success) {
          localStorage.setItem('chat_username', username);
          setIsLoggedIn(true);
          setNewUsername(username);
          setAvatar(res.user.avatar || '');
          setBio(res.user.bio || '');
          socket.emit('join_user', { username, avatar: '', bio: res.user.bio });
        } else {
          setAuthError(res.message);
        }
      });
    } else {
      socket.emit('login', { username, password }, (res) => {
        if (res.success) {
          localStorage.setItem('chat_username', username);
          setIsLoggedIn(true);
          setNewUsername(username);
          setAvatar(res.user.avatar || '');
          setBio(res.user.bio || '');
          socket.emit('join_user', { username, avatar: res.user.avatar || '', bio: res.user.bio });
        } else {
          setAuthError(res.message);
        }
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_username');
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
    setActiveChat(null);
    window.location.reload();
  };

  const handleDeleteAccount = () => {
    if (window.confirm("Diqqat! Akkauntingiz va barcha xabarlaringiz butunlay o'chib ketadi. Rozimisiz?")) {
      socket.emit('delete_account', { username }, (res) => {
        if (res.success) {
          handleLogout();
        } else {
          alert(res.message);
        }
      });
    }
  };

  const handleSelectChat = (chatItem, isGroup = false) => {
    const chatName = chatItem.name || chatItem.username;
    setHiddenChats(prev => prev.filter(n => n !== chatName));

    const chatData = { name: chatName, isGroup, avatar: chatItem.avatar || '' };
    setActiveChat(chatData);
    setMessages([]);
    setTypingStatus('');
    setEditingMsgId(null);
    setReplyingToMsg(null);
    setMessage('');
    socket.emit('join_room', { sender: username, target: chatData.name, isGroup });
  };

  const handleMessageChange = (e) => {
    setMessage(e.target.value);
    if (activeChat) {
      const roomName = activeChat.isGroup ? activeChat.name : [username, activeChat.name].sort().join('_');
      socket.emit('typing', { room: roomName, username });
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (message.trim() && activeChat) {
      const roomName = activeChat.isGroup ? activeChat.name : [username, activeChat.name].sort().join('_');
      if (editingMsgId) {
        socket.emit('edit_message', {
          msgId: editingMsgId,
          newText: message,
          room: roomName
        });
        setEditingMsgId(null);
      } else {
        const messageData = {
          sender: username,
          target: activeChat.name,
          text: message,
          file: null,
          fileName: null,
          fileType: null,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isGroup: activeChat.isGroup,
          replyTo: replyingToMsg ? { sender: replyingToMsg.sender, text: replyingToMsg.text || 'Fayl' } : null
        };
        socket.emit('send_message', messageData);
      }
      setMessage('');
      setReplyingToMsg(null);
      setShowEmojiPicker(false);
    }
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, msg });
  };

  const handleDeleteMessage = (msgId) => {
    if (activeChat) {
      const roomName = activeChat.isGroup ? activeChat.name : [username, activeChat.name].sort().join('_');
      socket.emit('delete_message', { msgId, room: roomName });
    }
    setContextMenu(null);
  };

  const handleStartEdit = (msg) => {
    setEditingMsgId(msg.id);
    setMessage(msg.text);
    setContextMenu(null);
  };

  const handleStartReply = (msg) => {
    setReplyingToMsg(msg);
    setContextMenu(null);
  };

  const handleToggleReaction = (msgId, emoji) => {
    if (activeChat) {
      const roomName = activeChat.isGroup ? activeChat.name : [username, activeChat.name].sort().join('_');
      socket.emit('toggle_reaction', { msgId, emoji, username, room: roomName });
    }
    setReactionPickerMsgId(null);
  };

  const handleClearChat = () => {
    if (!activeChat) return;
    if (window.confirm("Haqiqatan ham chat tarixini tozalamoqchimisiz?")) {
      const roomName = activeChat.isGroup ? activeChat.name : [username, activeChat.name].sort().join('_');
      socket.emit('clear_chat', { room: roomName });
    }
  };

  const handleDeleteChat = () => {
    if (!activeChat) return;
    if (window.confirm("Haqiqatan ham ushbu chatni o'chirib tashlamoqchimisiz?")) {
      const roomName = activeChat.isGroup ? activeChat.name : [username, activeChat.name].sort().join('_');
      socket.emit('clear_chat', { room: roomName });
      setHiddenChats(prev => [...prev, activeChat.name]);
      setMessages([]);
      setActiveChat(null);
    }
  };

  const handleLeaveOrDeleteGroup = () => {
    if (!activeChat || !activeChat.isGroup) return;
    const isConfirm = window.confirm("Guruhdan chiqmoqchimisiz yoki o'chirmoqchimisiz?");
    if (isConfirm) {
      socket.emit('delete_or_leave_group', { groupName: activeChat.name, username }, (res) => {
        if (res.success) {
          setHiddenChats(prev => [...prev, activeChat.name]);
          setActiveChat(null);
          setMessages([]);
        }
      });
    }
  };

  const handleCreateGroup = (e) => {
    e.preventDefault();
    if (newGroupName.trim()) {
      const allMemberNames = allUsers.map(u => u.username);
      socket.emit('create_group', { groupName: newGroupName.trim(), admin: username, members: allMemberNames }, (res) => {
        if (res.success) {
          setIsCreateGroupOpen(false);
          setNewGroupName('');
          handleSelectChat(res.group, true);
        } else {
          alert(res.message);
        }
      });
    }
  };

  const addEmoji = (emo) => setMessage(prev => prev + emo);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && activeChat) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const messageData = {
          sender: username,
          target: activeChat.name,
          text: '',
          file: reader.result,
          fileName: file.name,
          fileType: file.type,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isGroup: activeChat.isGroup,
          replyTo: replyingToMsg ? { sender: replyingToMsg.sender, text: replyingToMsg.text || 'Fayl' } : null
        };
        socket.emit('send_message', messageData);
        setReplyingToMsg(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result);
        socket.emit('update_profile', { oldUsername: username, newUsername: username, bio, avatar: reader.result }, () => {});
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    socket.emit('update_profile', { oldUsername: username, newUsername, bio, avatar }, (res) => {
      if (res.success) {
        localStorage.setItem('chat_username', res.newUsername);
        setUsername(res.newUsername);
        localStorage.setItem('chat_bio', bio);
        setIsSettingsOpen(false);
      } else {
        alert(res.message);
      }
    });
  };

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  // ⭐️ O'zini ro'yxatdan chiqarib tashlash (user2 o'zini ko'rmasligi uchun)
  const filteredUsers = allUsers
    .filter(u => u.username !== username)
    .filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(u => !hiddenChats.includes(u.username));

  const filteredGroups = allGroups
    .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(g => !hiddenChats.includes(g.name));

  if (!isLoggedIn) {
    return (
      <div className={`tg-login-container ${theme}`}>
        <form onSubmit={handleAuth} className="tg-login-card">
          <div className="tg-logo">
            <svg viewBox="0 0 24 24" width="64" height="64" fill="#2AABEE">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.69-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.38-.49 1.03-.75 4.03-1.75 6.72-2.91 8.07-3.47 3.83-1.6 4.63-1.88 5.15-1.89.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.13-.03.22z"/>
            </svg>
          </div>
          <h2>Telegram Web Pro</h2>
          <p className="tg-subtitle">{isRegistering ? 'Yangi hisob yaratish' : 'Xush kelibsiz'}</p>
          
          {authError && <div className="tg-error-msg">{authError}</div>}
          
          <div className="tg-input-group">
            <input type="text" placeholder="Foydalanuvchi nomi" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="tg-input-group">
            <input type="password" placeholder="Parol" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          
          <button type="submit" className="tg-btn">{isRegistering ? 'RO\'YXATDAN O\'TISH' : 'KIRISH'}</button>
          <p className="tg-switch-auth" onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}>
            {isRegistering ? 'Akkauntingiz bormi? Kirish' : 'Hisobingiz yo\'qmi? Ro\'yxatdan o\'tish'}
          </p>
        </form>
      </div>
    );
  }

  const currentPartner = activeChat && !activeChat.isGroup ? allUsers.find(u => u.username === activeChat.name) : null;

  return (
    <div className={`telegram-app ${theme} ${wallpaper} ${activeChat ? 'chat-active' : ''}`}>
      <div className="tg-sidebar">
        <div className="tg-sidebar-header">
          <div className="tg-user-profile" onClick={() => setIsSettingsOpen(true)} style={{ cursor: 'pointer' }}>
            {avatar ? <img src={avatar} alt="Avatar" className="tg-avatar-img" /> : <div className="tg-avatar my-avatar">{username[0].toUpperCase()}</div>}
            <div className="tg-user-details">
              <span className="tg-my-username">{username}</span>
              <span className="tg-chat-status online">{t.online}</span>
            </div>
          </div>
          <div className="tg-header-actions">
            <button onClick={() => setIsCreateGroupOpen(true)} className="tg-create-group-btn" title={t.createGroup}>👥</button>
            <button onClick={toggleTheme} className="tg-theme-toggle-icon">{theme === 'dark' ? '☀️' : '🌙'}</button>
            <button onClick={() => setIsSettingsOpen(true)} className="tg-settings-icon">⚙️</button>
          </div>
        </div>

        <div className="tg-search-bar">
          <input type="text" placeholder={t.search} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>

        <div className="tg-chats-list">
          {filteredGroups.map((group, index) => (
            <div key={`g_${index}`} className={`tg-chat-item ${activeChat?.name === group.name ? 'active' : ''}`} onClick={() => handleSelectChat(group, true)}>
              <div className="tg-avatar-container">
                <div className="tg-avatar group-avatar">👥</div>
              </div>
              <div className="tg-chat-info">
                <span className="tg-chat-name">{group.name}</span>
                <span className="tg-chat-status">{group.members?.length || 0} {t.membersCount}</span>
              </div>
            </div>
          ))}

          {filteredUsers.map((user, index) => (
            <div key={`u_${index}`} className={`tg-chat-item ${activeChat?.name === user.username ? 'active' : ''}`} onClick={() => handleSelectChat(user, false)}>
              <div className="tg-avatar-container">
                {user.avatar ? <img src={user.avatar} alt="Avatar" className="tg-avatar-img" /> : <div className="tg-avatar">{user.username[0].toUpperCase()}</div>}
                {user.isOnline && <span className="tg-online-badge"></span>}
              </div>
              <div className="tg-chat-info">
                <span className="tg-chat-name">{user.username}</span>
                <span className={`tg-chat-status ${user.isOnline ? 'online' : 'offline'}`}>{user.isOnline ? t.online : t.offline}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="tg-chat-area">
        {activeChat ? (
          <>
            <div className="tg-chat-header">
              <button className="tg-back-btn" onClick={() => setActiveChat(null)}>←</button>
              {activeChat.isGroup ? (
                <div className="tg-avatar group-avatar">👥</div>
              ) : currentPartner?.avatar ? (
                <img src={currentPartner.avatar} alt="Avatar" className="tg-avatar-img" />
              ) : (
                <div className="tg-avatar">{activeChat.name[0].toUpperCase()}</div>
              )}
              <div className="tg-chat-header-info">
                <h4>{activeChat.name}</h4>
                <span className="tg-sub-status">
                  {typingStatus ? typingStatus : (activeChat.isGroup ? 'Guruh' : (currentPartner?.isOnline ? t.online : t.offline))}
                </span>
              </div>

              <div className="tg-chat-header-actions">
                <button title={t.clearChat} onClick={handleClearChat} className="tg-action-btn">🧹</button>
                {activeChat.isGroup ? (
                  <button title={t.deleteGroup} onClick={handleLeaveOrDeleteGroup} className="tg-action-btn danger">🚪</button>
                ) : (
                  <button title={t.deleteChat} onClick={handleDeleteChat} className="tg-action-btn danger">🗑️</button>
                )}
              </div>
            </div>

            <div className="tg-messages-container">
              <div className="tg-messages-list">
                {messages.map((msg, index) => (
                  <div key={index} className={`tg-message-bubble ${msg.sender === username ? 'out' : 'in'}`} onContextMenu={(e) => handleContextMenu(e, msg)}>
                    
                    {msg.replyTo && (
                      <div className="tg-reply-preview-box">
                        <span className="tg-reply-sender">{msg.replyTo.sender}</span>
                        <span className="tg-reply-text">{msg.replyTo.text}</span>
                      </div>
                    )}

                    {msg.file && (
                      <div className="tg-file-container">
                        {msg.fileType && msg.fileType.startsWith('image/') ? (
                          <img src={msg.file} alt="Media" className="tg-message-image" onClick={() => setActiveMedia(msg.file)} />
                        ) : (
                          <div className="tg-document-box">
                            <span className="tg-doc-icon">📄</span>
                            <div className="tg-doc-info">
                              <span className="tg-doc-name">{msg.fileName || 'Fayl'}</span>
                              <a href={msg.file} download={msg.fileName || 'download'} className="tg-doc-download">{t.download} ⬇</a>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeChat.isGroup && msg.sender !== username && (
                      <div className="tg-group-msg-sender">{msg.sender}</div>
                    )}

                    {msg.text && <div className="tg-message-text">{msg.text}</div>}
                    
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="tg-reactions-container">
                        {Object.entries(msg.reactions).map(([emoji, users], idx) => (
                          <span key={idx} className={`tg-reaction-badge ${users.includes(username) ? 'active' : ''}`} onClick={() => handleToggleReaction(msg.id, emoji)}>
                            {emoji} {users.length}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="tg-message-footer">
                      {msg.isEdited && <span className="tg-edited-label">{t.edited}</span>}
                      <span className="tg-message-time">{msg.time}</span>
                      {msg.sender === username && (
                        <span className={`tg-read-receipt ${msg.isRead ? 'read' : 'unread'}`}>{msg.isRead ? '✓✓' : '✓'}</span>
                      )}
                      <button className="tg-reaction-trigger-btn" onClick={(e) => { e.stopPropagation(); setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id); }}>➕</button>
                    </div>

                    {reactionPickerMsgId === msg.id && (
                      <div className="tg-reaction-popover" onClick={(e) => e.stopPropagation()}>
                        {emojiList.map((emo, eIdx) => (
                          <span key={eIdx} onClick={() => handleToggleReaction(msg.id, emo)}>{emo}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {contextMenu && (
              <div className="tg-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => handleStartReply(contextMenu.msg)}><span>↩️</span> {t.reply}</button>
                {contextMenu.msg.sender === username && contextMenu.msg.text && (
                  <button onClick={() => handleStartEdit(contextMenu.msg)}><span>✏️</span> {t.edit}</button>
                )}
                <button onClick={() => handleDeleteMessage(contextMenu.msg.id)} className="delete-action"><span>🗑️</span> {t.delete}</button>
              </div>
            )}

            {replyingToMsg && (
              <div className="tg-editing-bar">
                <div>
                  <span style={{ fontWeight: 'bold' }}>↩️ {replyingToMsg.sender}: </span>
                  <span>{replyingToMsg.text || 'Fayl'}</span>
                </div>
                <button onClick={() => setReplyingToMsg(null)}>✕</button>
              </div>
            )}

            {editingMsgId && (
              <div className="tg-editing-bar">
                <span>✏️ Xabarni tahrirlash</span>
                <button onClick={() => { setEditingMsgId(null); setMessage(''); }}>✕</button>
              </div>
            )}

            <form onSubmit={sendMessage} className="tg-message-input-area">
              <div className="tg-emoji-picker-container">
                <button type="button" className="tg-emoji-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>😊</button>
                {showEmojiPicker && (
                  <div className="tg-emoji-popover">
                    {emojiList.map((emo, idx) => (<span key={idx} onClick={() => addEmoji(emo)}>{emo}</span>))}
                  </div>
                )}
              </div>

              <label htmlFor="file-input" className="tg-attach-btn" title="Fayl biriktirish">📎</label>
              <input id="file-input" type="file" onChange={handleFileUpload} style={{ display: 'none' }} />

              <input type="text" placeholder={t.typeMessage} value={message} onChange={handleMessageChange} />
              <button type="submit" className="tg-send-btn">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </form>
          </>
        ) : (
          <div className="tg-no-chat-selected">
            <div className="tg-select-hint">{t.selectChatHint}</div>
          </div>
        )}
      </div>

      {isCreateGroupOpen && (
        <div className="tg-modal-overlay" onClick={() => setIsCreateGroupOpen(false)}>
          <div className="tg-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t.createGroup}</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="tg-setting-group">
                <label>{t.groupName}</label>
                <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Masalan: Dasturchilar" required />
              </div>
              <div className="tg-modal-buttons">
                <button type="submit" className="tg-save-btn">{t.save}</button>
                <button type="button" onClick={() => setIsCreateGroupOpen(false)} className="tg-cancel-btn">{t.close}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="tg-modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="tg-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="tg-settings-header-banner">
              {avatar ? <img src={avatar} alt="Avatar" className="tg-settings-avatar" /> : <div className="tg-settings-avatar-placeholder">{username[0].toUpperCase()}</div>}
              <h3>{username}</h3>
              <span className="tg-settings-sub">{t.accountInfo}</span>
            </div>
            
            <form onSubmit={handleSaveProfile}>
              <div className="tg-setting-group">
                <label>{t.changeAvatar}</label>
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="tg-file-input" />
              </div>
              <div className="tg-setting-group">
                <label>{t.changeUsername}</label>
                <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
              </div>
              <div className="tg-setting-group">
                <label>{t.bio}</label>
                <input type="text" value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
              <div className="tg-setting-group">
                <label>{t.theme}</label>
                <select value={theme} onChange={(e) => setTheme(e.target.value)} className="tg-theme-select">
                  <option value="dark">{t.darkTheme}</option>
                  <option value="light">{t.lightTheme}</option>
                </select>
              </div>
              <div className="tg-setting-group">
                <label>{t.chatWallpaper}</label>
                <select value={wallpaper} onChange={(e) => setWallpaper(e.target.value)} className="tg-theme-select">
                  <option value="doodle">{t.doodleWallpaper}</option>
                  <option value="plain">{t.defaultWallpaper}</option>
                </select>
              </div>
              <div className="tg-setting-group">
                <label>{t.notifications}</label>
                <select value={notifications ? 'true' : 'false'} onChange={(e) => setNotifications(e.target.value === 'true')} className="tg-theme-select">
                  <option value="true">{t.soundEnabled}</option>
                  <option value="false">{t.soundDisabled}</option>
                </select>
              </div>
              <div className="tg-setting-group">
                <label>{t.language}</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="tg-theme-select">
                  <option value="uz">O'zbekcha 🇺🇿</option>
                  <option value="en">English 🇬🇧</option>
                </select>
              </div>
              <div className="tg-modal-buttons">
                <button type="submit" className="tg-save-btn">{t.save}</button>
                <button type="button" onClick={() => setIsSettingsOpen(false)} className="tg-cancel-btn">{t.close}</button>
              </div>
              
              <button type="button" onClick={handleLogout} className="tg-logout-btn-full">🚪 {t.logout}</button>
              <button type="button" onClick={handleDeleteAccount} className="tg-delete-account-btn-full">🗑️ {t.deleteAccount}</button>
            </form>
          </div>
        </div>
      )}

      {activeMedia && (
        <div className="tg-media-viewer" onClick={() => setActiveMedia(null)}>
          <button className="tg-media-close">✕</button>
          <img src={activeMedia} alt="Full view" onClick={(e) => e.stopPropagation()} />
          <a href={activeMedia} download="image.jpg" className="tg-media-download-btn" onClick={(e) => e.stopPropagation()}>{t.download} ⬇</a>
        </div>
      )}
    </div>
  );
}

export default App;