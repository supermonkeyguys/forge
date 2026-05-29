package handler

import "golang.org/x/crypto/bcrypt"

// BcryptHasher implements PasswordHasher using bcrypt.
type BcryptHasher struct{}

func (BcryptHasher) Hash(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

func (BcryptHasher) Verify(hash, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}
