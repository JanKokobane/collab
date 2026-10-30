import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type AuthMode = 'signin' | 'signup';
type IconName = 'user' | 'mail' | 'phone' | 'building' | 'edit' | 'briefcase' | 'globe' | 'lock' | 'chevron';

const collaborationTypes = [
  'Product collaboration',
  'Event partnership',
  'Content creation',
  'Influencer campaign',
  'Other',
];

const industries = [
  'Advertising and Marketing',
  'Agriculture',
  'Automotive',
  'Construction and Real Estate',
  'Consumer Goods',
  'Education',
  'Energy and Utilities',
  'Entertainment and Media',
  'Fashion and Beauty',
  'Financial Services',
  'Food and Beverage',
  'Government and Public Sector',
  'Healthcare and Life Sciences',
  'Hospitality and Tourism',
  'Manufacturing',
  'Nonprofit',
  'Professional Services',
  'Retail and E-commerce',
  'Technology',
  'Transportation and Logistics',
];

const countryCodes = [
  '🇺🇸🇨🇦 United States / Canada (+1)',
  '🇬🇧 United Kingdom (+44)',
  '🇰🇪 Kenya (+254)',
  '🇿🇦 South Africa (+27)',
  '🇦🇺 Australia (+61)',
  '🇳🇿 New Zealand (+64)',
  '🇮🇳 India (+91)',
  '🇳🇬 Nigeria (+234)',
  '🇺🇬 Uganda (+256)',
  '🇹🇿 Tanzania (+255)',
  '🇬🇭 Ghana (+233)',
  '🇷🇼 Rwanda (+250)',
  '🇪🇹 Ethiopia (+251)',
  '🇪🇬 Egypt (+20)',
  '🇦🇪 United Arab Emirates (+971)',
  '🇸🇦 Saudi Arabia (+966)',
  '🇫🇷 France (+33)',
  '🇩🇪 Germany (+49)',
  '🇪🇸 Spain (+34)',
  '🇮🇹 Italy (+39)',
  '🇳🇱 Netherlands (+31)',
  '🇮🇪 Ireland (+353)',
  '🇯🇵 Japan (+81)',
  '🇰🇷 South Korea (+82)',
  '🇨🇳 China (+86)',
  '🇧🇷 Brazil (+55)',
  '🇲🇽 Mexico (+52)',
];

function Logo() {
  const player = useVideoPlayer(require('@/assets/images/logoVideo.mp4'), (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  return (
    <View style={styles.logoCrop}>
      <VideoView
        accessible
        accessibilityLabel="Collab"
        player={player}
        contentFit="contain"
        nativeControls={false}
        style={styles.logoVideo}
      />
    </View>
  );
}

function FieldIcon({ name, color = '#909090' }: { name: IconName; color?: string }) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      {name === 'user' && (
        <>
          <Circle {...common} cx="12" cy="8" r="4" />
          <Path {...common} d="M5 21a7 7 0 0 1 14 0" />
        </>
      )}
      {name === 'mail' && <Path {...common} d="M4 5h16v14H4zM4 6l8 6 8-6" />}
      {name === 'phone' && <Path {...common} d="M6 3h3l2 5-2 2a14 14 0 0 0 5 5l2-2 5 2v3c0 1-1 2-2 2C11 20 4 13 4 5c0-1 1-2 2-2Z" />}
      {name === 'building' && <Path {...common} d="M4 21h16M6 21V5l6-3v19M18 21v-9l-6-3M9 8h1M9 12h1M9 16h1" />}
      {name === 'edit' && <Path {...common} d="m4 20 4-.8L19 8a2 2 0 0 0-3-3L5 16l-1 4ZM14.5 6.5l3 3" />}
      {name === 'briefcase' && <Path {...common} d="M4 7h16v13H4zM8 7V5h8v2M4 12h16M10 12v2h4v-2" />}
      {name === 'globe' && <><Circle {...common} cx="12" cy="12" r="9" /><Path {...common} d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>}
      {name === 'lock' && <><Rect {...common} x="4" y="10" width="16" height="11" rx="2" /><Path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" /></>}
      {name === 'chevron' && <Path {...common} d="m7 10 5 5 5-5" />}
    </Svg>
  );
}

type FieldProps = {
  label: string;
  icon: IconName;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  compact?: boolean;
  error?: string;
};

function FormField({
  label,
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  compact = false,
  error,
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(!secureTextEntry);

  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <View style={styles.fieldLabelRow}>
        <Text style={[styles.fieldLabel, compact && styles.compactFieldLabel]}>{label}</Text>
        <Text style={[styles.requiredMarker, compact && styles.compactRequiredMarker]}>*</Text>
      </View>
      <View style={[styles.inputRow, compact && styles.compactInputRow, focused && styles.inputRowFocused]}>
        <View style={styles.inputIcon}>
          <FieldIcon name={icon} color={focused ? '#F2B900' : '#909090'} />
        </View>
        {error && (
          <View style={styles.fieldErrorContainer}>
            <Text style={styles.fieldError}>{error}</Text>
          </View>
        )}
        <TextInput
          style={[styles.input, compact && styles.compactInput]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#989898"
          secureTextEntry={secureTextEntry && !visible}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setVisible((current) => !current)}>
            <Text style={[styles.visibilityText, compact && styles.compactVisibilityText]}>{visible ? 'Hide' : 'Show'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ChoiceField({
  label,
  icon,
  placeholder,
  value,
  options,
  onChange,
  compact = false,
  error,
}: {
  label: string;
  icon: IconName;
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  compact?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <View style={styles.fieldLabelRow}>
        <Text style={[styles.fieldLabel, compact && styles.compactFieldLabel]}>{label}</Text>
        <Text style={[styles.requiredMarker, compact && styles.compactRequiredMarker]}>*</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose ${label}`}
        onPress={() => setOpen((current) => !current)}
        style={[styles.inputRow, compact && styles.compactInputRow, open && styles.inputRowFocused]}>
        <View style={styles.inputIcon}>
          <FieldIcon name={icon} color={open ? '#F2B900' : '#909090'} />
        </View>
        <Text style={[styles.choiceText, compact && styles.compactInput, !value && styles.placeholderText]}>{value || placeholder}</Text>
        <FieldIcon name="chevron" />
      </Pressable>
      {open && (
        <View style={styles.options}>
          {options.map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                onChange(option);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {error && (
        <View style={styles.fieldErrorContainer}>
          <Text style={styles.fieldError}>{error}</Text>
        </View>
      )}
    </View>
  );
}

type SocialProvider = 'Google' | 'GitHub' | 'Microsoft';

function SocialLogo({ provider }: { provider: SocialProvider }) {
  if (provider === 'Microsoft') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Rect x="2" y="2" width="9" height="9" fill="#F25022" />
        <Rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
        <Rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
        <Rect x="13" y="13" width="9" height="9" fill="#FFB900" />
      </Svg>
    );
  }

  if (provider === 'GitHub') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path
          fill="#FFFFFF"
          d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 7.99c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
        />
      </Svg>
    );
  }

  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M21.6 12.23c0-.7-.06-1.38-.18-2.03H12v3.84h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.89-1.74 2.99-4.3 2.99-7.34Z" />
      <Path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.22-2.51c-.9.6-2.05.95-3.39.95-2.61 0-4.82-1.76-5.61-4.13H3.06v2.59A9.99 9.99 0 0 0 12 22Z" />
      <Path fill="#FBBC05" d="M6.39 13.88A6 6 0 0 1 6.08 12c0-.65.11-1.29.31-1.88V7.53H3.06A10 10 0 0 0 2 12c0 1.61.39 3.13 1.06 4.47l3.33-2.59Z" />
      <Path fill="#EA4335" d="M12 5.99c1.47 0 2.79.51 3.83 1.5l2.87-2.87C16.95 2.99 14.7 2 12 2a9.99 9.99 0 0 0-8.94 5.53l3.33 2.59C7.18 7.75 9.39 5.99 12 5.99Z" />
    </Svg>
  );
}

function SocialButton({ provider, compact = false }: { provider: SocialProvider; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Continue with ${provider}`}
      onPress={() => Alert.alert(provider, `${provider} authentication will be connected next.`)}
      style={({ pressed }) => [
        styles.socialButton,
        provider === 'Google' && styles.googleButton,
        provider === 'GitHub' && styles.githubButton,
        provider === 'Microsoft' && styles.microsoftButton,
        compact && styles.compactSocialButton,
        pressed && styles.buttonPressed,
      ]}>
      <SocialLogo provider={provider} />
    </Pressable>
  );
}

export default function AuthScreen() {
  const { width, height } = useWindowDimensions();
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [phone, setPhone] = useState('');
  const [collaborationType, setCollaborationType] = useState('');
  const [collaborationOther, setCollaborationOther] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [industry, setIndustry] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const badgeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    Animated.timing(badgeAnimation, {
      toValue: 1,
      duration: 650,
      delay: 120,
      useNativeDriver: true,
    }).start();

    return () => badgeAnimation.stopAnimation();
  }, [badgeAnimation]);

  const compact = width <= 375;
  const short = height <= 700;
  const heroHeight = (short ? 165 : compact ? 190 : 220) * 1.1;
  const isSignup = mode === 'signup';

  function submit() {
    const nextErrors: Record<string, string> = {};
    if (isSignup && !name.trim()) nextErrors.name = 'Enter your full name.';
    if (!email.trim()) nextErrors.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (isSignup && !countryCode) nextErrors.countryCode = 'Select a country code.';
    if (isSignup && !phone.trim()) nextErrors.phone = 'Enter your phone number.';
    else if (isSignup && !/^[0-9\s()+-]{7,20}$/.test(phone.trim())) nextErrors.phone = 'Enter a valid phone number.';
    if (isSignup && !collaborationType) nextErrors.collaborationType = 'Choose a collaboration type.';
    if (isSignup && collaborationType === 'Other' && !collaborationOther.trim()) nextErrors.collaborationOther = 'Describe the collaboration.';
    if (isSignup && !company.trim()) nextErrors.company = 'Enter your company name.';
    if (isSignup && !role.trim()) nextErrors.role = 'Enter your role or job title.';
    if (isSignup && !industry) nextErrors.industry = 'Choose an industry.';
    if (!password.trim()) nextErrors.password = 'Enter your password.';
    else if (password.length < 6) nextErrors.password = 'Use at least 6 characters.';
    if (isSignup && !confirmation.trim()) nextErrors.confirmation = 'Confirm your password.';
    else if (isSignup && password !== confirmation) nextErrors.confirmation = 'Passwords do not match.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    Alert.alert(isSignup ? 'Account created' : 'Welcome back', 'Authentication will be connected next.');
  }

  if (!hydrated) return <View style={styles.hydrationShell} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ImageBackground
          source={require('@/assets/images/loginBG.jpg')}
          resizeMode="cover"
          style={[styles.hero, { height: heroHeight + 29.4, marginBottom: -29.4 }]}
          imageStyle={[styles.heroImage, { transform: [{ translateX: width * -0.01 }, { translateY: heroHeight * 0.029 }, { scaleX: 0.85 }, { scaleY: 0.9 }] }]}>
          <View style={styles.heroOverlay}>
            <Animated.View
              style={[
                styles.ideaBadge,
                {
                  opacity: badgeAnimation,
                  transform: [
                    {
                      translateY: badgeAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-12 - heroHeight * 0.04, -heroHeight * 0.04],
                      }),
                    },
                  ],
                },
              ]}>
              <View style={styles.ideaBadgeDot} />
              <Text style={styles.ideaBadgeText}>Ideas fit better together</Text>
            </Animated.View>
            <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
              Build something{'\n'}brilliant, together.
            </Text>
          </View>
        </ImageBackground>

        <View style={styles.authCard}>
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}>
            <View style={styles.authCardContent}>
              {!short && <Logo />}
              <View style={styles.heading}>
                <Text style={styles.headingTitle}>{isSignup ? 'Create your account' : 'Sign in'}</Text>
                <Text style={styles.headingDescription}>
                  {isSignup ? 'Start building better ideas with your team.' : 'Your next great collaboration starts here.'}
                </Text>
              </View>
              <View style={styles.modeSwitch}>
                {(['signin', 'signup'] as AuthMode[]).map((nextMode) => (
                  <Pressable
                    key={nextMode}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === nextMode }}
                    onPress={() => {
                      setMode(nextMode);
                      setPassword('');
                      setConfirmation('');
                      setErrors({});
                    }}
                    style={[styles.modeButton, mode === nextMode && styles.modeButtonActive]}>
                    <Text style={[styles.modeButtonText, mode === nextMode && styles.modeButtonTextActive]}>
                      {nextMode === 'signin' ? 'Sign in' : 'Sign up'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {isSignup && (
                <>
                  <FormField label="Your Full Name" icon="user" placeholder="e.g. David Makau" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} />
                  <FormField label="Work Email" icon="mail" placeholder="you@company.com" value={email} onChangeText={setEmail} keyboardType="email-address" error={errors.email} />
                  <View style={styles.phoneFields}>
                    <View style={styles.countryField}>
                      <ChoiceField label="Country code" icon="phone" placeholder="Country code" value={countryCode} options={countryCodes} onChange={setCountryCode} error={errors.countryCode} />
                    </View>
                    <View style={styles.phoneField}>
                      <FormField label="Phone Number" icon="phone" placeholder="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
                    </View>
                  </View>
                  <ChoiceField label="Type of Collaboration" icon="building" placeholder="Choose a collaboration type" value={collaborationType} options={collaborationTypes} onChange={setCollaborationType} error={errors.collaborationType} />
                  {collaborationType === 'Other' && (
                    <FormField label="Describe the Campaign or Collaboration" icon="edit" placeholder="Tell us what you would like to work on" value={collaborationOther} onChangeText={setCollaborationOther} error={errors.collaborationOther} />
                  )}
                  <FormField label="Brand or Company Name" icon="building" placeholder="e.g. Northstar" value={company} onChangeText={setCompany} error={errors.company} />
                  <FormField label="Role or Job Title" icon="briefcase" placeholder="e.g. Marketing Manager" value={role} onChangeText={setRole} error={errors.role} />
                  <ChoiceField label="Industry" icon="globe" placeholder="Choose an industry" value={industry} options={industries} onChange={setIndustry} error={errors.industry} />
                </>
              )}

              {!isSignup && (
                <FormField label="Email address" icon="mail" placeholder="you@company.com" value={email} onChangeText={setEmail} keyboardType="email-address" error={errors.email} />
              )}
              <FormField label="Password" icon="lock" placeholder={isSignup ? 'Create a secure password' : 'Enter your password'} value={password} onChangeText={setPassword} secureTextEntry error={errors.password} />
              {isSignup && (
                <FormField label="Confirm Password" icon="lock" placeholder="Re-enter your password" value={confirmation} onChangeText={setConfirmation} secureTextEntry error={errors.confirmation} />
              )}
              {!isSignup && (
                <Pressable onPress={() => Alert.alert('Reset password', 'A password reset link will be sent to your email.')} style={styles.forgotButton}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={submit} style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}>
                <Text style={styles.submitButtonText}>{isSignup ? 'Create account' : 'Sign in'}</Text>
                <Text style={styles.submitArrow}>→</Text>
              </Pressable>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR {isSignup ? 'SIGN UP' : 'SIGN IN'} WITH</Text>
                <View style={styles.dividerLine} />
              </View>
              <View style={styles.socialRow}>
                <SocialButton provider="Google" />
                <SocialButton provider="GitHub" />
                <SocialButton provider="Microsoft" />
              </View>
              <View style={styles.footer}>
                <Text style={styles.footerLink}>Privacy</Text>
                <Text style={styles.footerSeparator}>•</Text>
                <Text style={styles.footerLink}>Terms</Text>
                <Text style={styles.footerSeparator}>•</Text>
                <Text style={styles.copyright}>© 2026 Collab</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hydrationShell: { flex: 1, minHeight: '100%', backgroundColor: '#FAF6E9' },
  safeArea: { flex: 1, backgroundColor: '#FAF6E9' },
  keyboardView: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#FAF6E9' },
  formScroll: { flex: 1, backgroundColor: 'transparent' },
  formScrollContent: { flexGrow: 1 },
  hero: { overflow: 'hidden', backgroundColor: '#FAF6E9' },
  heroImage: { resizeMode: 'cover' },
  heroOverlay: { flex: 1, justifyContent: 'flex-start', alignItems: 'flex-start', paddingHorizontal: 22, paddingTop: 40, backgroundColor: 'rgba(250, 246, 233, 0.12)' },
  ideaBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#202020',
    borderRadius: 999,
    backgroundColor: '#FFBD18',
    shadowColor: '#202020',
    shadowOffset: {
      width: 3,
      height: 3,
    },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  ideaBadgeDot: {
    width: 6,
    height: 6,
    marginRight: 7,
    borderRadius: 3,
    backgroundColor: '#202020',
  },
  ideaBadgeText: {
    color: '#202020',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: { width: '100%', maxWidth: 330, marginTop: 12, color: '#202020', fontSize: 25, lineHeight: 28, fontWeight: '900', letterSpacing: -1 },
  heroTitleCompact: { maxWidth: 300 },
  authCard: { flex: 1, minHeight: 440, marginTop: 6.5, borderTopLeftRadius: 29.4, borderTopRightRadius: 29.4, borderTopWidth: 1, borderColor: '#E2E2E2', backgroundColor: '#FFFFFF', shadowColor: '#332D1A', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 10 },
  authCardContent: { flexGrow: 1, paddingTop: 88, paddingHorizontal: 22, paddingBottom: 28 },
  authCardContentCompact: { paddingTop: 18, paddingBottom: 18 },
  logoCrop: { position: 'absolute', top: 10, alignSelf: 'center', width: 900, height: 75, overflow: 'hidden', zIndex: 2 },
  logoVideo: { alignSelf: 'center', width: 600, height: 130, marginTop: -50 },
  compactLogoVideo: { width: 400, height: 60, marginBottom: 12 },
  logo: { height: 32, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 18 },
  logoSymbol: { width: 30, height: 27, flexDirection: 'row', alignItems: 'flex-end' }, logoDot: { position: 'absolute', top: 0, left: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#202020' }, logoSmallBlock: { width: 13, height: 12, marginLeft: 5, backgroundColor: '#FFC400' }, logoTallBlock: { width: 13, height: 24, backgroundColor: '#FFC400' },
  logoText: { marginLeft: 5, color: '#202020', fontSize: 21, lineHeight: 25, fontWeight: '800', letterSpacing: -1 }, logoPeriod: { color: '#FFC400', fontSize: 21, lineHeight: 25, fontWeight: '800' },
  heading: { alignItems: 'center' }, headingTitle: { color: '#202020', fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' }, headingDescription: { marginTop: 6, color: '#777777', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  compactHeadingTitle: { fontSize: 21, lineHeight: 25 }, compactHeadingDescription: { marginTop: 4, fontSize: 11, lineHeight: 15 },
  modeSwitch: { height: 45, flexDirection: 'row', marginTop: 22, marginBottom: 22, padding: 4, borderRadius: 23, backgroundColor: '#F1F1F1' }, modeButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 20 }, modeButtonActive: { backgroundColor: '#FFFFFF', shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 2 }, modeButtonText: { color: '#797979', fontSize: 12, fontWeight: '700' }, modeButtonTextActive: { color: '#202020' },
  compactModeSwitch: { height: 39, marginTop: 16, marginBottom: 16, padding: 3 }, compactModeButtonText: { fontSize: 11 },
  field: { marginBottom: 18 }, fieldLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 }, fieldLabel: { color: '#383838', fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }, requiredMarker: { marginLeft: 4, color: '#FF3D28', fontSize: 12, fontWeight: '800', lineHeight: 12 }, fieldErrorContainer: { width: '100%', marginTop: 5 }, fieldError: { color: '#D92D20', fontSize: 10, fontWeight: '600' },
  compactField: { marginBottom: 12 }, compactFieldLabel: { fontSize: 9 }, compactRequiredMarker: { fontSize: 10, lineHeight: 10 }, compactInputRow: { height: 38 }, compactInput: { fontSize: 12 }, compactVisibilityText: { fontSize: 9 },
  inputRow: { height: 44, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: '#292929' }, inputRowFocused: { borderBottomColor: '#FFC400' }, inputIcon: { width: 20, alignItems: 'center' }, input: { height: '100%', flex: 1, marginHorizontal: 12, paddingVertical: 0, color: '#202020', fontSize: 13 }, visibilityText: { color: '#858585', fontSize: 10, fontWeight: '700' },
  choiceText: { flex: 1, marginHorizontal: 12, color: '#202020', fontSize: 13 }, placeholderText: { color: '#989898' }, options: { marginTop: 4, borderWidth: 1, borderColor: '#E2E2E2', borderRadius: 8, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 4 }, option: { paddingHorizontal: 12, paddingVertical: 10 }, optionPressed: { backgroundColor: '#FFF8DC' }, optionText: { color: '#202020', fontSize: 12 },
  phoneFields: { flexDirection: 'row', gap: 8 }, countryField: { flex: 0.9 }, phoneField: { flex: 1.5 },
  forgotButton: { alignSelf: 'flex-end', marginTop: -8 }, forgotText: { color: '#696969', fontSize: 11, fontWeight: '600' },
  compactForgotButton: { marginTop: -5 }, compactForgotText: { fontSize: 10 },
  submitButton: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 25, backgroundColor: '#242424', shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 6 }, submitButtonPressed: { backgroundColor: '#111111', transform: [{ scale: 0.99 }] }, submitButtonText: { marginRight: 9, color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, submitArrow: { color: '#FFFFFF', fontSize: 18 },
  compactSubmitButton: { height: 43, marginTop: 12 }, compactSubmitButtonText: { fontSize: 12 }, compactSubmitArrow: { fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 }, compactDivider: { marginVertical: 16 }, dividerLine: { height: 1, flex: 1, backgroundColor: '#E3E3E3' }, dividerText: { marginHorizontal: 12, color: '#A0A0A0', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  socialRow: { flexDirection: 'row', gap: 8 }, socialButton: { height: 38, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 }, googleButton: { backgroundColor: '#F1F5FF' }, githubButton: { backgroundColor: '#202020' }, microsoftButton: { backgroundColor: '#F3F4F6' }, compactSocialButton: { height: 34 }, buttonPressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 25, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#ECECEC' }, compactFooter: { marginTop: 16, paddingTop: 14 }, footerLink: { color: '#777777', fontSize: 9 }, footerSeparator: { marginHorizontal: 6, color: '#B0B0B0', fontSize: 9 }, copyright: { color: '#858585', fontSize: 9 },
});
