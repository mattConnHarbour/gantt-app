import { useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';

export function SignIn() {
  const { signIn } = useAuth();

  useEffect(() => {
    document.title = 'Sign In';
    return () => {
      document.title = 'Gantt Chart';
    };
  }, []);

  return (
    <div className="sign-in-container">
      <div className="sign-in-box">
        <h1>Sign In</h1>
        <GoogleLogin
          onSuccess={(response) => {
            if (response.credential) {
              // Verify email domain
              const payload = JSON.parse(atob(response.credential.split('.')[1]));
              if (!payload.email?.endsWith('@harbourshare.com')) {
                alert('You must sign in with a @harbourshare.com email');
                return;
              }
              signIn(response.credential);
            }
          }}
          onError={() => {
            console.error('Login failed');
          }}
        />
      </div>
    </div>
  );
}
