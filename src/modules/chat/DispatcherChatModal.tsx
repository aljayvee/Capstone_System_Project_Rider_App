import React, { useState } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Colors, FontWeights, BorderRadius } from '../../config/theme';
import { ChatMessage } from '../../types/rider';

export interface DispatcherChatModalProps {
  visible: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  errandId: string;
  errandType: string;
  onSendMessage?: (text: string) => void;
  onSend?: (text: string) => void;
}

export function DispatcherChatModal({
  visible,
  onClose,
  messages,
  errandId,
  errandType,
  onSendMessage,
  onSend,
}: DispatcherChatModalProps) {
  const sendMessageHandler = onSendMessage || onSend || (() => {});
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (inputText.trim()) {
      sendMessageHandler(inputText.trim());
      setInputText('');
    }
  };


  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.bottomSheet}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>💬 Dispatcher</Text>
              <Text style={styles.headerSubtitle}>Re: {errandId} – {errandType}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <ScrollView contentContainerStyle={styles.messagesContainer}>
            {messages.length === 0 ? (
              <Text style={styles.emptyStateText}>No messages yet. Start the conversation!</Text>
            ) : (
              messages.map(msg => {
                const isRider = msg.from === 'rider';
                return (
                  <View 
                    key={msg.id} 
                    style={[
                      styles.messageWrapper,
                      isRider ? styles.messageWrapperRight : styles.messageWrapperLeft
                    ]}
                  >
                    <View style={[
                      styles.messageBubble,
                      isRider ? styles.messageBubbleRider : styles.messageBubbleDispatcher
                    ]}>
                      <Text style={[
                        styles.messageText,
                        isRider ? styles.messageTextRider : styles.messageTextDispatcher
                      ]}>
                        {msg.text}
                      </Text>
                      <Text style={[
                        styles.messageTimestamp,
                        isRider ? styles.messageTimestampRider : styles.messageTimestampDispatcher
                      ]}>
                        {msg.timestamp}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Message dispatcher..."
              placeholderTextColor={Colors.textLight}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: Colors.bgWhite,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '80%',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  header: {
    backgroundColor: Colors.navy,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: Colors.textWhite,
    fontWeight: FontWeights.bold,
    fontSize: 14,
  },
  headerSubtitle: {
    color: Colors.navyLight,
    fontSize: 12,
  },
  closeButton: {
    backgroundColor: Colors.whiteOverlayLight,
    borderRadius: BorderRadius.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  closeButtonText: {
    color: Colors.textWhite,
  },
  messagesContainer: {
    padding: 14,
    gap: 8,
    flexGrow: 1,
  },
  emptyStateText: {
    color: Colors.textLight,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 20,
  },
  messageWrapper: {
    flexDirection: 'row',
  },
  messageWrapperRight: {
    justifyContent: 'flex-end',
  },
  messageWrapperLeft: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  messageBubbleRider: {
    backgroundColor: Colors.navy,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.sm,
    borderBottomRightRadius: BorderRadius.lg,
  },
  messageBubbleDispatcher: {
    backgroundColor: Colors.bgGray,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.sm,
  },
  messageText: {
    fontSize: 13,
  },
  messageTextRider: {
    color: Colors.textWhite,
  },
  messageTextDispatcher: {
    color: Colors.textDark,
  },
  messageTimestamp: {
    fontSize: 10,
    marginTop: 3,
    textAlign: 'right',
  },
  messageTimestampRider: {
    color: Colors.navyLight,
  },
  messageTimestampDispatcher: {
    color: Colors.textLight,
  },
  inputContainer: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    fontSize: 13,
  },
  sendButton: {
    backgroundColor: Colors.navy,
    borderRadius: BorderRadius.xl,
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.semibold,
    fontSize: 13,
  },
});

export default DispatcherChatModal;

