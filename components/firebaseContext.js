import { createContext } from 'react';

const FirebaseContext = createContext(null);

export const FirebaseProvider = ({ children, firebase }) => {
  return (
    <FirebaseContext.Provider value={firebase}>
      {children}
    </FirebaseContext.Provider>
  );
};

export default FirebaseContext;
