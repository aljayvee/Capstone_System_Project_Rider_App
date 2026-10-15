import React, { useState } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Colors, FontWeights, BorderRadius } from '../../config/theme';
import { ChatMessage } from '../../types/rider';
import { formatErrandId } from '../../utils/formatErrandId';
import DispatcherAvatar from '../../components/DispatcherAvatar';

export interface DispatcherChatModalProps {
  visible: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  errandId: string;
  errandType: string;
  dispatcherId?: string | number | null;
  dispatcherName?: string | null;
  onSendMessage?: (text: string) => void;
  onSend?: (text: string) => void;
}

export function DispatcherChatModal({
  visible,
  onClose,
  messages,
  errandId,
  errandType,
  dispatcherId,
  dispatcherName,
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
      statusBarTranslucent
    >
      {/* The full-screen overlay pads by the keyboard's height and the sheet,
          anchored to its bottom, rides up on it. This used to be the sheet's
          own KeyboardAvoidingView with behavior={undefined} on Android, which
          did nothing, so the message field sat under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <View style={styles.bottomSheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <DispatcherAvatar dispatcherId={dispatcherId} size={32} />
              <View>
                <Text style={styles.headerTitle}>{dispatcherName || 'Dispatcher'}</Text>
                <Text style={styles.headerSubtitle}>Re: Errand #{formatErrandId(errandId)} – {errandType}</Text>
              </View>
            </View>
            <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close the chat">
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
            <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            accessibilityRole="button"
            accessibilityLabel="Send this message">
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    // Gives way to the keyboard rather than pushing its header off the top.
    flexShrink: 1,
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
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderColor: Colors.border,
    fontSize: 13,
  },
  sendButton: {
    backgroundColor: Colors.navy,
    borderRadius: BorderRadius.xl,
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  sendButtonText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.semibold,
    fontSize: 13,
  },
});

export default DispatcherChatModal;

