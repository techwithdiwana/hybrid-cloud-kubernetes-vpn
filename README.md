# Hybrid Cloud Kubernetes Project
## Azure AKS ↔ pfSense IPSec VPN ↔ On-Prem Kubernetes

This project demonstrates a real-world Hybrid Cloud architecture where:

- Frontend Application runs on Azure AKS
- Backend API runs on On-Prem Kubernetes
- Secure communication established using IPSec Site-to-Site VPN
- pfSense acts as the VPN Gateway

---

# Architecture

```text
Azure AKS Frontend
        ↓
Azure VPN Gateway
        ↓
IPSec VPN Tunnel
        ↓
pfSense Firewall
        ↓
On-Prem Kubernetes Backend
```

---

# Technologies Used

- Microsoft Azure
- Azure AKS
- Kubernetes (kubeadm)
- containerd
- Calico CNI
- pfSense Firewall
- IPSec VPN (IKEv2)
- Hyper-V
- Docker
- React
- FastAPI
- Azure CLI

---

# Network Details

| Component | IP Range |
|---|---|
| Azure VNet | 10.0.0.0/16 |
| Azure Subnet | 10.0.1.0/24 |
| On-Prem LAN | 10.10.10.0/24 |
| pfSense LAN | 10.10.10.1 |
| k8s-master | 10.10.10.101 |
| k8s-worker | 10.10.10.102 |

---

# Step 1 - Create Hyper-V VMs

## Master Node
- 4 GB RAM
- 4 vCPU
- 40 GB Disk

## Worker Node
- 2 GB RAM
- 2 vCPU
- 30 GB Disk

Use Internal Virtual Switch.

---

# Step 2 - Disable Swap

```bash
sudo swapoff -a
sudo sed -i '/ swap / s/^/#/' /etc/fstab
```

---

# Step 3 - Configure Kernel Modules

```bash
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter
```

---

# Step 4 - Configure Sysctl

```bash
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF

sudo sysctl --system
```

---

# Step 5 - Install Containerd

```bash
sudo apt update
sudo apt install -y containerd

sudo mkdir -p /etc/containerd

containerd config default | sudo tee /etc/containerd/config.toml
```

Edit:

```text
SystemdCgroup = true
```

Restart:

```bash
sudo systemctl restart containerd
sudo systemctl enable containerd
```

---

# Step 6 - Install Kubernetes Packages

```bash
sudo apt update
sudo apt install -y apt-transport-https ca-certificates curl gpg

curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt update
sudo apt install -y kubelet kubeadm kubectl

sudo apt-mark hold kubelet kubeadm kubectl
```

---

# Step 7 - Initialize Kubernetes Master

```bash
sudo kubeadm init --pod-network-cidr=192.168.0.0/16
```

---

# Step 8 - Configure kubectl

```bash
mkdir -p $HOME/.kube

sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config

sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

---

# Step 9 - Install Calico CNI

```bash
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/calico.yaml
```

---

# Step 10 - Join Worker Node

```bash
sudo kubeadm join <MASTER-IP>:6443 --token <TOKEN> \
--discovery-token-ca-cert-hash sha256:<HASH>
```

Verify:

```bash
kubectl get nodes
```

---

# Step 11 - Deploy Backend Application

```bash
kubectl create namespace hybrid-onprem
```

Deploy backend:

```bash
kubectl apply -f backend-deployment.yaml
kubectl apply -f backend-service.yaml
```

Verify:

```bash
curl http://10.10.10.102:30001/api
```

---

# Step 12 - Create Azure Resource Group

```powershell
az group create --name aks-free-rg --location centralindia
```

---

# Step 13 - Create Azure VNet

```powershell
az network vnet create --resource-group aks-free-rg --name aks-free-vnet --address-prefix 10.0.0.0/16 --subnet-name aks-subnet --subnet-prefix 10.0.1.0/24
```

---

# Step 14 - Create AKS Cluster

```powershell
az aks create --resource-group aks-free-rg --name free-aks --node-count 1 --node-vm-size Standard_B2s --network-plugin azure --tier free --generate-ssh-keys
```

Connect:

```powershell
az aks get-credentials --resource-group aks-free-rg --name free-aks
```

---

# Step 15 - Create Gateway Subnet

```powershell
az network vnet subnet create --resource-group aks-free-rg --vnet-name aks-free-vnet --name GatewaySubnet --address-prefix 10.0.255.0/27
```

---

# Step 16 - Create Azure VPN Gateway

## Create Public IP

```powershell
az network public-ip create --resource-group aks-free-rg --name aks-vpn-pip --sku Standard --zone 1 2 3
```

## Create VPN Gateway

```powershell
az network vnet-gateway create --resource-group aks-free-rg --name aks-vpn-gateway --public-ip-address aks-vpn-pip --vnet aks-free-vnet --gateway-type Vpn --vpn-type RouteBased --sku VpnGw1AZ
```

---

# Step 17 - Configure Airtel Router

Forward:

- UDP 500
- UDP 4500

To:

```text
192.168.1.7 (pfSense WAN)
```

---

# Step 18 - Configure pfSense IPSec VPN

## Phase 1

- IKEv2
- AES256
- SHA256
- DH Group 2
- NAT Traversal Enabled

## Phase 2

Local Network:

```text
10.10.10.0/24
```

Remote Network:

```text
10.0.0.0/16
```

---

# Step 19 - Create Azure Local Network Gateway

```powershell
az network local-gateway create --resource-group aks-free-rg --name onprem-local-gateway --gateway-ip-address <PUBLIC-IP> --local-address-prefixes 10.10.10.0/24
```

---

# Step 20 - Create Azure VPN Connection

```powershell
az network vpn-connection create --resource-group aks-free-rg --name azure-to-onprem --vnet-gateway1 aks-vpn-gateway --local-gateway2 onprem-local-gateway --shared-key HybridCloud123!
```

---

# Step 21 - Verify VPN Connectivity

```powershell
az network vpn-connection show --resource-group aks-free-rg --name azure-to-onprem --query connectionStatus
```

Expected:

```text
Connected
```

---

# Project Outcome

Successfully established secure Hybrid Cloud connectivity between:

- Azure AKS
- pfSense Firewall
- On-Prem Kubernetes

using IPSec Site-to-Site VPN.

---

# Interview Explanation

## Project Objective

The goal of this project was to establish secure communication between cloud-native workloads running on Azure AKS and legacy workloads running in an On-Prem Kubernetes environment.

## My Responsibilities

- Built Kubernetes cluster using kubeadm
- Installed containerd runtime
- Installed Calico networking
- Provisioned AKS cluster using Azure CLI
- Configured Azure VPN Gateway
- Configured pfSense IPSec VPN
- Configured routing and firewall rules
- Troubleshot VPN and routing issues

## Challenges Faced

- IPSec proposal mismatch
- NAT traversal issues
- Azure VPN Gateway SKU compatibility
- Routing issues between AKS and On-Prem network

## Resolution

- Matched IPSec Phase1 and Phase2 settings
- Enabled NAT Traversal
- Configured UDP 500 and 4500 forwarding
- Verified VPN connectivity from both Azure and pfSense

## Real World Use Case

This architecture is commonly used during enterprise cloud migration where frontend or modern services move to cloud while backend legacy applications remain On-Prem.
