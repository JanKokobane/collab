import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import type { MessageCallType } from '@/lib/messagesApi';

export function MessageCallProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useMessageCalls() {
  return {
    activeCall: null,
    incomingCall: null,
    startingCall: false,
    startCall: async (
      _conversationId: string,
      _peerName: string,
      _type: MessageCallType,
    ) => {
      Alert.alert('Use the mobile app', 'Voice and video calls are available in the mobile app.');
    },
    acceptCall: async () => {},
    declineCall: async () => {},
    hangUp: async () => {},
    toggleMicrophone: () => {},
    toggleCamera: () => {},
  };
}
