package service

import (
	"bytes"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/jiangtejie/infinite-canvas-pro/repository"
)

type payRequest struct { MchOrderNo string `json:"mchOrderNo"`; PayType string `json:"payType"`; Amount int `json:"amount"`; Description string `json:"description"`; NotifyURL string `json:"notifyUrl"`; ExpireMinutes int `json:"expireMinutes"` }
type payResult struct { MchOrderNo string `json:"mchOrderNo"`; CodeURL string `json:"codeUrl"`; Status string `json:"status"`; TransactionID string `json:"transactionId"`; Amount int `json:"amount"` }
func RechargePackages() ([]model.RechargePackage, error) { return repository.ListRechargePackages() }
func CreateNativeRecharge(userID, packageID string) (model.RechargeOrder, error) {
	if config.Cfg.LXPayServerURL == "" || config.Cfg.LXPayAppID == "" || config.Cfg.LXPayAppSecret == "" || config.Cfg.LXPayNotifyURL == "" { return model.RechargeOrder{}, safeMessageError{message:"微信支付尚未配置"} }
	pkg, ok, err := repository.GetRechargePackage(packageID); if err != nil { return model.RechargeOrder{}, err }; if !ok { return model.RechargeOrder{}, safeMessageError{message:"充值套餐不存在"} }
	nowTime := time.Now(); order := model.RechargeOrder{ID:newID("recharge"), OrderNo:strings.ReplaceAll(newID("wx"),"-",""), UserID:userID, PackageID:pkg.ID, PackageName:pkg.Name, AmountFen:pkg.AmountFen, Credits:pkg.Credits+pkg.Bonus, Status:model.RechargeOrderPending, ExpiresAt:nowTime.Add(time.Duration(config.Cfg.RechargeOrderMinutes)*time.Minute).Format(time.RFC3339), CreatedAt:nowTime.Format(time.RFC3339), UpdatedAt:nowTime.Format(time.RFC3339)}
	if err:=repository.CreateRechargeOrder(&order); err!=nil{return order,err}; result,err:=lxPayRequest("POST","/api/payment/create",payRequest{order.OrderNo,"NATIVE",order.AmountFen,"算力点充值 - "+pkg.Name,config.Cfg.LXPayNotifyURL,config.Cfg.RechargeOrderMinutes});if err!=nil{return order,err};order.CodeURL=result.CodeURL;	if order.CodeURL==""{return order,errors.New("支付网关未返回二维码链接")};order.UpdatedAt=time.Now().Format(time.RFC3339);if err=repository.SaveRechargeOrder(&order);err!=nil{return order,err};return order,nil
}
func QueryNativeRecharge(userID,id string)(model.RechargeOrder,error){
	order,ok,err:=repository.GetRechargeOrder(id);if err!=nil{return order,err};if !ok||order.UserID!=userID{return order,safeMessageError{message:"订单不存在"}}
	if order.Status == model.RechargeOrderPending && repository.IsExpired(order.ExpiresAt) {
		now := time.Now().Format(time.RFC3339)
		changed, expireErr := repository.ExpireRechargeOrder(order.ID, now)
		if expireErr != nil {
			return order, expireErr
		}
		if changed {
			order.Status = model.RechargeOrderExpired
		}
	}
	if order.Status==model.RechargeOrderPending&&config.Cfg.LXPayServerURL!=""{result,e:=lxPayRequest("GET","/api/payment/query/"+order.OrderNo,nil);if e==nil&&strings.EqualFold(result.Status,"SUCCESS")&&result.Amount>0{_,err=repository.MarkRechargeOrderPaid(order.OrderNo,result.TransactionID,time.Now().Format(time.RFC3339),result.Amount);if err!=nil{return order,err};order.Status=model.RechargeOrderPaid}}
	return order,nil
}
func lxPayRequest(method,path string,input any)(payResult,error){
	var result payResult;body:=[]byte("");if input!=nil{var err error;body,err=json.Marshal(input);if err!=nil{return result,err}};req,err:=http.NewRequest(method,strings.TrimRight(config.Cfg.LXPayServerURL,"/")+path,bytes.NewReader(body));if err!=nil{return result,err}
	timestamp:=strconv.FormatInt(time.Now().Unix(),10);nonce:=strings.ReplaceAll(newID(""),"-","");mac:=hmac.New(sha256.New,[]byte(config.Cfg.LXPayAppSecret));mac.Write([]byte(config.Cfg.LXPayAppID+timestamp+nonce+string(body)));req.Header.Set("Content-Type","application/json");req.Header.Set("X-App-Id",config.Cfg.LXPayAppID);req.Header.Set("X-Timestamp",timestamp);req.Header.Set("X-Nonce",nonce);req.Header.Set("X-Signature",hex.EncodeToString(mac.Sum(nil)))
	timeout:=config.Cfg.LXPayTimeoutMS;if timeout<1000{timeout=10000};resp,err:=(&http.Client{Timeout:time.Duration(timeout)*time.Millisecond}).Do(req);if err!=nil{return result,err};defer resp.Body.Close();data,err:=io.ReadAll(io.LimitReader(resp.Body,1<<20));if err!=nil{return result,err};if resp.StatusCode<200||resp.StatusCode>=300{return result,fmt.Errorf("payment gateway status %d",resp.StatusCode)};var wrapper struct{Code int `json:"code"`;Msg string `json:"msg"`;Data json.RawMessage `json:"data"`};if json.Unmarshal(data,&wrapper)==nil&&len(wrapper.Data)>0{if wrapper.Code!=0{return result,errors.New(wrapper.Msg)};data=wrapper.Data};if err:=json.Unmarshal(data,&result);err!=nil{return result,err};return result,nil
}
type paymentNotify struct{AppID string `json:"appId"`;MchOrderNo string `json:"mchOrderNo"`;TransactionID string `json:"transactionId"`;Amount int `json:"amount"`;Status string `json:"status"`;Timestamp json.RawMessage `json:"timestamp"`;Nonce string `json:"nonce"`;Signature string `json:"signature"`}
func ProcessPaymentNotify(raw []byte,headers http.Header)error{var body map[string]any;if err:=json.Unmarshal(raw,&body);err!=nil{return err};if headers.Get("Wechatpay-Serial")!=""{if err:=verifyWechatSignature(raw,headers);err!=nil{return err};return processV3Notify(body)};var n paymentNotify;if err:=json.Unmarshal(raw,&n);err!=nil{return err};ts:=strings.Trim(string(n.Timestamp),`"`);if n.AppID!=config.Cfg.LXPayAppID||n.Signature==""||n.Amount<=0{return errors.New("invalid payment notification")};timestamp,err:=strconv.ParseInt(ts,10,64);if err!=nil||time.Since(time.Unix(timestamp,0))>5*time.Minute||time.Since(time.Unix(timestamp,0))< -5*time.Minute{return errors.New("payment notification expired")};delete(body,"signature");unsigned,err:=json.Marshal(body);if err!=nil{return err};mac:=hmac.New(sha256.New,[]byte(config.Cfg.LXPayAppSecret));mac.Write([]byte(n.AppID+ts+n.Nonce+string(unsigned)));expected,err:=hex.DecodeString(n.Signature);if err!=nil||subtle.ConstantTimeCompare(mac.Sum(nil),expected)!=1{return errors.New("invalid payment signature")};if !strings.EqualFold(n.Status,"SUCCESS"){return errors.New("payment not successful")};_,err=repository.MarkRechargeOrderPaid(n.MchOrderNo,n.TransactionID,time.Now().Format(time.RFC3339),n.Amount);return err}
func verifyWechatSignature(raw []byte,headers http.Header)error{serial:=headers.Get("Wechatpay-Serial");ts:=headers.Get("Wechatpay-Timestamp");nonce:=headers.Get("Wechatpay-Nonce");signature,err:=base64.StdEncoding.DecodeString(headers.Get("Wechatpay-Signature"));if err!=nil||serial==""||ts==""||nonce==""{return errors.New("invalid WeChat signature headers")};timestamp,err:=strconv.ParseInt(ts,10,64);if err!=nil||time.Since(time.Unix(timestamp,0))>5*time.Minute||time.Since(time.Unix(timestamp,0))< -5*time.Minute{return errors.New("WeChat notification expired")};certPEM,err:=os.ReadFile(config.Cfg.LXPayPlatformCertPath);if err!=nil{return err};block,_:=pem.Decode(certPEM);if block==nil{return errors.New("invalid WeChat platform certificate")};cert,err:=x509.ParseCertificate(block.Bytes);if err!=nil{return err};serialNumber:=strings.TrimLeft(strings.ToLower(serial),"0");if serialNumber==""{serialNumber="0"};if strings.ToLower(cert.SerialNumber.Text(16))!=serialNumber{return errors.New("WeChat certificate serial mismatch")};pub,ok:=cert.PublicKey.(*rsa.PublicKey);if !ok{return errors.New("invalid WeChat platform public key")};digest:=sha256.Sum256([]byte(ts+"\n"+nonce+"\n"+string(raw)+"\n"));return rsa.VerifyPKCS1v15(pub,crypto.SHA256,digest[:],signature)}
func processV3Notify(body map[string]any)error{
	// The gateway validates the V3 RSA signature before forwarding this callback; APIv3 key decrypts its resource.
	res,ok:=body["resource"].(map[string]any);if !ok{return errors.New("missing encrypted resource")};cipherText,_:=res["ciphertext"].(string);nonce,_:=res["nonce"].(string);aad,_:=res["associated_data"].(string);key:=config.Cfg.LXPayAPIV3Key;if len(key)!=32{return errors.New("invalid API v3 key")};block,err:=aes.NewCipher([]byte(key));if err!=nil{return err};gcm,err:=cipher.NewGCM(block);if err!=nil{return err};encrypted,err:=base64.StdEncoding.DecodeString(cipherText);if err!=nil{return err};plain,err:=gcm.Open(nil,[]byte(nonce),encrypted,[]byte(aad));if err!=nil{return err};var trade struct{AppID string `json:"appid"`;OrderNo string `json:"out_trade_no"`;TransactionID string `json:"transaction_id"`;State string `json:"trade_state"`;Amount struct{Total int `json:"total"`} `json:"amount"`};if err:=json.Unmarshal(plain,&trade);err!=nil{return err};if trade.AppID!=""&&trade.AppID!=config.Cfg.LXPayAppID{return errors.New("payment app id mismatch")};if trade.State!="SUCCESS"||trade.Amount.Total<=0{return errors.New("payment not successful or missing amount")};_,err=repository.MarkRechargeOrderPaid(trade.OrderNo,trade.TransactionID,time.Now().Format(time.RFC3339),trade.Amount.Total);return err
}
