package model

const (
	RechargeOrderPending = "pending"
	RechargeOrderPaid    = "paid"
	RechargeOrderExpired = "expired"
	RechargeOrderFailed  = "failed"
)

type RechargePackage struct {
	ID        string  `json:"id" gorm:"primaryKey"`
	Name      string  `json:"name"`
	AmountFen int     `json:"amountFen"`
	Credits   float64 `json:"credits" gorm:"type:decimal(20,2)"`
	Bonus     float64 `json:"bonus" gorm:"type:decimal(20,2)"`
	Sort      int     `json:"sort"`
	Enabled   bool    `json:"enabled"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

type RechargeOrder struct {
	ID            string  `json:"id" gorm:"primaryKey"`
	OrderNo       string  `json:"orderNo" gorm:"uniqueIndex"`
	UserID        string  `json:"userId" gorm:"index"`
	PackageID     string  `json:"packageId"`
	PackageName   string  `json:"packageName"`
	AmountFen     int     `json:"amountFen"`
	Credits       float64 `json:"credits" gorm:"type:decimal(20,2)"`
	Status        string  `json:"status" gorm:"index"`
	TransactionID string  `json:"transactionId"`
	CodeURL       string  `json:"codeUrl"`
	ExpiresAt     string  `json:"expiresAt"`
	PaidAt        string  `json:"paidAt"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
}

type InvoiceRequest struct {
	ID        string `json:"id" gorm:"primaryKey"`
	UserID    string `json:"userId" gorm:"index;uniqueIndex:idx_invoice_user_order"`
	OrderNo   string `json:"orderNo" gorm:"uniqueIndex:idx_invoice_user_order"`
	Title     string `json:"title"`
	TaxNumber string `json:"taxNumber"`
	Email     string `json:"email"`
	Status    string `json:"status"`
	CreatedAt string `json:"createdAt"`
}
