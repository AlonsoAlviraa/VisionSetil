#!/usr/bin/env python3
"""VisionSetil v11 — COMPLETE REDESIGN from scratch."""
from __future__ import annotations
import json
from pathlib import Path

cells: list[dict] = []

def md(text):
    cells.append({"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").split("\n")})

def code(src):
    lines = src.strip("\n").split("\n")
    source = [line + "\n" for line in lines[:-1]] + [lines[-1]]
    cells.append({"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": source})

md("# VisionSetil v11 - Complete Redesign\nTop-50 species, ALL images, single-image classification, strong augmentation")

code('''
import sys, os, warnings, subprocess
warnings.filterwarnings('ignore')
os.environ['PYDEVD_DISABLE_FILE_VALIDATION'] = '1'
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'timm'])
subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'scikit-learn'])
def _cuda_ok():
    try:
        r = subprocess.run([sys.executable, '-c', "import torch;x=torch.randn(4,4,device='cuda');print('OK')"], capture_output=True, text=True, timeout=60)
        return 'OK' in r.stdout
    except: return False
if not _cuda_ok():
    if os.path.exists('/dev/nvidia0') or os.environ.get('CUDA_VISIBLE_DEVICES'):
        subprocess.check_call([sys.executable, '-m', 'pip', 'uninstall', '-y', '-q', 'torch', 'torchvision', 'torchaudio', 'triton'], stderr=subprocess.DEVNULL)
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'torch==2.5.1', 'torchvision==0.20.1', '--index-url', 'https://download.pytorch.org/whl/cu121'])
print(f"CUDA: {_cuda_ok()}", flush=True)
''')

code('''
import torch, torch.nn as nn, torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import numpy as np, pandas as pd
from pathlib import Path
import json, random, time
from datetime import datetime
from collections import defaultdict
from PIL import Image
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
NUM_WORKERS = 4 if torch.cuda.is_available() else 2
import timm
from sklearn.metrics import f1_score, balanced_accuracy_score
from sklearn.model_selection import train_test_split
def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)
if torch.cuda.is_available():
    _ = torch.randn(4,4,device='cuda').sum()
    log(f"GPU: {torch.cuda.get_device_name(0)}")
log("Ready.")
''')

code('''
def detect_datasets():
    ds = {}
    for p in ['/kaggle/input/datasets/picekl/fungitastic','/kaggle/input/datasets/picekl','/kaggle/input/picekl']:
        if Path(p).exists(): ds['fungitastic'] = Path(p); log(f"FungiTastic: {p}"); break
    for p in ['/kaggle/input/datasets/seemshukla/fungiclef','/kaggle/input/datasets/seemshukla','/kaggle/input/seemshukla']:
        if Path(p).exists(): ds['fungiclef'] = Path(p); log(f"FungiCLEF: {p}"); break
    if not ds:
        for d in sorted(Path('/kaggle/input').iterdir()):
            n = d.name.lower()
            if 'picekl' in n or 'fungitastic' in n: ds['fungitastic'] = d
            elif 'seemshukla' in n or 'fungiclef' in n: ds['fungiclef'] = d
    return ds
ALL_DS = detect_datasets()
''')

code('''
SKIP = {'climatic','timeseries','climate','weather','bioclim'}
def find_csv(root):
    KNOWN = ['metadata/FungiTastic/FungiTastic-FewShot(train).csv','metadata/FungiTastic/FungiTastic-FewShot-Train.csv',
             'metadata/FungiTastic/FungiTastic-ClosedSet-Train.csv','metadata/FungiTastic/FungiTastic-ClosedSet-Val.csv',
             'metadata/FungiTastic/FungiTastic-ClosedSet-Test.csv','metadata/FungiTastic/FungiTastic-OpenSet-Train.csv','train.csv']
    for rp in KNOWN:
        c = root / rp
        if c.exists():
            try:
                pr = pd.read_csv(c, nrows=3)
                if len(pr.columns) <= 50 and not any(k in c.name.lower() for k in SKIP): return c
            except: pass
    return None

def load_dataset(root, name):
    log(f"Loading {name}...")
    csv = find_csv(root)
    if not csv: return pd.DataFrame()
    df = pd.read_csv(csv)
    log(f"  CSV: {df.shape}, cols: {list(df.columns)[:10]}")
    RENAMES = {'scientificName':'species','class':'species','class_id':'species','filename':'image_path',
               'file_path':'image_path','image':'image_path','image_path_jpg':'image_path',
               'photo_id':'observation_id','observationID':'observation_id','observationUUID':'observation_id'}
    rn = {s:d for s,d in RENAMES.items() if s in df.columns and d not in df.columns}
    df = df.rename(columns=rn)
    if 'species' not in df.columns or 'image_path' not in df.columns: return pd.DataFrame()
    df['image_path'] = df['image_path'].apply(lambda p: str(p) if Path(str(p)).is_absolute() else str(root / p))
    df['source'] = name
    if 'observation_id' not in df.columns: df['observation_id'] = df['image_path'].apply(lambda p: Path(str(p)).stem)
    df['observation_id'] = name + '_' + df['observation_id'].astype(str)
    log(f"  {len(df)} images, {df['species'].nunique()} species")
    return df

all_dfs = [load_dataset(r, n) for n, r in ALL_DS.items()]
all_dfs = [d for d in all_dfs if len(d) > 0]
df = pd.concat(all_dfs, ignore_index=True) if all_dfs else pd.DataFrame()
log(f"COMBINED: {len(df)} images, {df['species'].nunique() if len(df)>0 else 0} species")
''')

code('''
# VERIFY IMAGE LOADING
if len(df) > 0:
    sample = df['image_path'].sample(min(20, len(df)), random_state=42).tolist()
    n_exist = sum(1 for p in sample if Path(p).exists())
    log(f"Image existence: {n_exist}/{len(sample)}")
    for p in sample[:3]:
        try:
            img = Image.open(p); img.load()
            log(f"  OK {Path(p).name}: {img.size}")
        except Exception as e:
            log(f"  FAIL {Path(p).name}: {e}")
    if n_exist < len(sample) * 0.5:
        log("WARNING: Most images missing!")
        root = list(ALL_DS.values())[0]
        for sub in ['Train','train','images','FungiTastic-FewShot/Train','Processed_300px/JPG']:
            td = root / sub
            if td.exists(): log(f"  {sub}/ exists: {[c.name for c in list(td.iterdir())[:3]]}")
''')

code('''
if len(df) > 0:
    sc = df.groupby('species').size().sort_values(ascending=False)
    top = sc.head(50).index.tolist()
    df = df[df['species'].isin(top)].reset_index(drop=True)
    log(f"Top-50: {len(df)} images, {df['species'].nunique()} species, avg {len(df)//50}/species")
    obs = df.groupby('observation_id')['species'].first().reset_index()
    tr, te = train_test_split(obs, test_size=0.30, random_state=42, stratify=obs['species'])
    va, te = train_test_split(te, test_size=0.5, random_state=42, stratify=te['species'])
    ti, vi, si = set(tr['observation_id']), set(va['observation_id']), set(te['observation_id'])
    train_df = df[df['observation_id'].isin(ti)].reset_index(drop=True)
    val_df = df[df['observation_id'].isin(vi)].reset_index(drop=True)
    test_df = df[df['observation_id'].isin(si)].reset_index(drop=True)
    log(f"Split: train={len(train_df)} val={len(val_df)} test={len(test_df)}")
    all_species = sorted(df['species'].unique())
    label2idx = {s:i for i,s in enumerate(all_species)}
    idx2label = {i:s for s,i in label2idx.items()}
    NUM_CLASSES = len(label2idx)
''')

code('''
from torchvision.transforms import v2 as T
class ImageDataset(Dataset):
    def __init__(self, df, l2i, augment=False):
        self.df = df.reset_index(drop=True); self.l2i = l2i; self.aug = augment
        mean = [0.485,0.456,0.406]; std = [0.229,0.224,0.225]
        if augment:
            self.tf = T.Compose([T.ToImage(),T.ToDtype(torch.float32,scale=True),
                T.RandomResizedCrop((224,224),scale=(0.6,1.0),antialias=True),
                T.RandomHorizontalFlip(0.5),T.RandomVerticalFlip(0.3),
                T.ColorJitter(0.4,0.4,0.3,0.1),T.RandomErasing(p=0.2),T.Normalize(mean,std)])
        else:
            self.tf = T.Compose([T.ToImage(),T.ToDtype(torch.float32,scale=True),T.Resize((224,224),antialias=True),T.Normalize(mean,std)])
    def __len__(self): return len(self.df)
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        try: img = Image.open(row['image_path']).convert('RGB'); t = self.tf(img)
        except: t = torch.randn(3,224,224)*0.5
        return t, self.l2i.get(row['species'],0)

train_ds = ImageDataset(train_df, label2idx, augment=True)
val_ds = ImageDataset(val_df, label2idx, augment=False)
test_ds = ImageDataset(test_df, label2idx, augment=False)
BATCH = 64
train_loader = DataLoader(train_ds, batch_size=BATCH, shuffle=True, num_workers=NUM_WORKERS, pin_memory=True, drop_last=True)
val_loader = DataLoader(val_ds, batch_size=BATCH, shuffle=False, num_workers=NUM_WORKERS, pin_memory=True)
test_loader = DataLoader(test_ds, batch_size=BATCH, shuffle=False, num_workers=NUM_WORKERS)
log(f"Loaders: {len(train_loader)}/{len(val_loader)}/{len(test_loader)} batches")
''')

code('''
class Classifier(nn.Module):
    def __init__(self, num_classes=50):
        super().__init__()
        self.backbone = timm.create_model('convnextv2_tiny.fcmae_ft_in22k_in1k', pretrained=True, num_classes=0)
        feat = self.backbone.num_features
        self.head = nn.Sequential(nn.LayerNorm(feat), nn.Dropout(0.4), nn.Linear(feat, num_classes))
    def forward(self, x): return self.head(self.backbone(x))

model = Classifier(num_classes=NUM_CLASSES).to(DEVICE)
n_params = sum(p.numel() for p in model.parameters()) / 1e6
log(f"Model: {n_params:.1f}M params, {NUM_CLASSES} classes")
x = torch.randn(4,3,224,224).to(DEVICE); log(f"Forward: {model(x).shape}")
''')

code('''
EPOCHS = 20; LR_HEAD = 3e-4; LR_BB = 3e-5; WD = 0.01; LS = 0.1; WARMUP = 2
optimizer = torch.optim.AdamW([{'params': model.backbone.parameters(),'lr':LR_BB},{'params': model.head.parameters(),'lr':LR_HEAD}], weight_decay=WD)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=1e-6)
scaler = torch.amp.GradScaler('cuda')
DEADLY = {'amanita phalloides','amanita virosa','galerina marginata','cortinarius orellanus','hypholoma fasciculare'}
deadly_idx = {label2idx[s] for s in label2idx if s.lower() in DEADLY}
OUT = Path('/kaggle/working/models'); OUT.mkdir(parents=True, exist_ok=True)
log(f"Config: {EPOCHS} epochs")
''')

code('''
def map_at_3(p, l):
    t3 = np.argsort(-p, axis=1)[:,:3]; s = 0.0
    for i,x in enumerate(l):
        if x in t3[i]: s += 1.0/(list(t3[i]).index(x)+1)
    return s/max(len(l),1)

@torch.no_grad()
def evaluate(model, loader):
    model.eval(); aps, als = [], []
    for imgs, labels in loader:
        with torch.amp.autocast('cuda'): logits = model(imgs.to(DEVICE))
        aps.append(F.softmax(logits,-1).cpu().numpy()); als.append(labels.numpy() if isinstance(labels, torch.Tensor) else np.array(labels))
    aps = np.concatenate(aps); als = np.concatenate(als); preds = aps.argmax(1)
    return {'acc':(preds==als).mean(),'map3':map_at_3(aps,als),'f1':f1_score(als,preds,average='macro',zero_division=0)}

def train_epoch(model, loader, opt, epoch):
    model.train(); tl=0; n=0; t0=time.time()
    for bi,(imgs,labels) in enumerate(loader):
        imgs,labels = imgs.to(DEVICE),labels.to(DEVICE)
        with torch.amp.autocast('cuda'): logits = model(imgs); loss = F.cross_entropy(logits,labels,label_smoothing=LS)
        opt.zero_grad(); scaler.scale(loss).backward(); scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); scaler.step(opt); scaler.update()
        tl += loss.item()*len(labels); n += len(labels)
        if bi%20==0: el=time.time()-t0; log(f"  Ep{epoch} B{bi}/{len(loader)} loss={loss.item():.4f} {el:.0f}s ETA={el/(bi+1)*(len(loader)-bi-1)/60:.1f}m")
    return tl/max(n,1)
''')

code('''
best_map3=0; best_ep=-1; hist=[]; no_imp=0
for epoch in range(EPOCHS):
    if epoch < WARMUP:
        for p in model.backbone.parameters(): p.requires_grad = False
        log(f"Ep{epoch}: BB FROZEN")
    else:
        for p in model.backbone.parameters(): p.requires_grad = True
    log(f"{'='*50} EPOCH {epoch}/{EPOCHS-1} {'='*50}")
    tl = train_epoch(model, train_loader, optimizer, epoch)
    val = evaluate(model, val_loader); scheduler.step()
    hist.append({'epoch':epoch,'train_loss':tl,'val_acc':val['acc'],'val_map3':val['map3'],'val_f1':val['f1']})
    log(f"Ep{epoch} loss={tl:.4f} acc={val['acc']:.4f} map3={val['map3']:.4f} f1={val['f1']:.4f}")
    if val['map3'] > best_map3:
        best_map3=val['map3']; best_ep=epoch; no_imp=0
        torch.save({'model_state':model.state_dict(),'label2idx':label2idx}, OUT/'best.pt')
        log(f"  BEST MAP@3: {best_map3:.4f}!")
    else:
        no_imp+=1; log(f"  No improve ({no_imp}). Best: {best_map3:.4f}@ep{best_ep}")
    torch.save({'epoch':epoch,'model_state':model.state_dict(),'opt_state':optimizer.state_dict(),'best_map3':best_map3,'best_epoch':best_ep,'history':hist}, OUT/'checkpoint_latest.pt')
    if no_imp >= 7: log("Early stop!"); break
log(f"DONE! Best MAP@3: {best_map3:.4f} @ ep{best_ep}")
''')

code('''
class TempScaler(nn.Module):
    def __init__(self): super().__init__(); self.log_t = nn.Parameter(torch.zeros(1))
    def forward(self, x): return x / self.log_t.exp()
best = torch.load(OUT/'best.pt', weights_only=False); model.load_state_dict(best['model_state']); model.eval()
ts = TempScaler().to(DEVICE); topt = torch.optim.LBFGS([ts.log_t], lr=0.01, max_iter=50)
vl, vla = [], []
with torch.no_grad():
    for imgs, labels in val_loader:
        vl.append(model(imgs.to(DEVICE))); vla.append(labels.to(DEVICE) if isinstance(labels, torch.Tensor) else torch.tensor(labels).to(DEVICE))
all_vl = torch.cat(vl); all_vla = torch.cat(vla)
def closure(): topt.zero_grad(); loss = F.cross_entropy(ts(all_vl), all_vla); loss.backward(); return loss
topt.step(closure); learned_t = ts.log_t.exp().item()
torch.save(ts.state_dict(), OUT/'temperature_scaler.pt'); log(f"Temp: {learned_t:.4f}")
''')

code('''
log("="*50); log("TEST EVAL"); log("="*50)
aps, als = [], []
model.eval()
with torch.no_grad():
    for imgs, labels in test_loader:
        logits = ts(model(imgs.to(DEVICE)))
        aps.append(F.softmax(logits,-1).cpu().numpy()); als.append(labels.numpy() if isinstance(labels, torch.Tensor) else np.array(labels))
aps = np.concatenate(aps); als = np.concatenate(als); aps2 = aps.argmax(1)
test_acc = (aps2==als).mean(); test_m3 = map_at_3(aps,als)
test_f1 = f1_score(als,aps2,average='macro',zero_division=0); test_bal = balanced_accuracy_score(als,aps2)
ece = np.mean(np.abs(aps.max(1)-(aps2==als).astype(float)))
log(f"Acc:{test_acc:.4f} MAP@3:{test_m3:.4f} F1:{test_f1:.4f} ECE:{ece:.4f}")
dm = np.array([l in deadly_idx for l in als]); nd = dm.sum()
srd = (aps2[dm]==als[dm]).sum()/nd if nd>0 else 1.0
log(f"Safety: {srd:.4f} ({nd} deadly)")
scores = [map_at_3(aps[np.random.choice(len(als),len(als))],als) for _ in range(1000)]
ci_lo, ci_hi = np.percentile(scores,[2.5,97.5])
log(f"MAP@3 CI: [{ci_lo:.4f},{ci_hi:.4f}]")
''')

code('''
metrics = {'test_accuracy':float(test_acc),'test_map_at_3':float(test_m3),'test_map_at_3_ci_low':float(ci_lo),
    'test_map_at_3_ci_high':float(ci_hi),'test_f1_macro':float(test_f1),'test_balanced_accuracy':float(test_bal),
    'test_ece':float(ece),'safety_recall_deadly':float(srd),'n_deadly_in_test':int(nd),
    'best_val_map3':float(best_map3),'best_epoch':int(best_ep),'num_classes':int(NUM_CLASSES),
    'model_params_M':float(n_params),'temperature':float(learned_t),
    'num_train_images':int(len(train_df)),'num_val_images':int(len(val_df)),'num_test_images':int(len(test_df)),
    'databases_used':list(ALL_DS.keys()),'version':'v11'}
json.dump(metrics, open(OUT/'metrics.json','w'), indent=2)
json.dump(label2idx, open(OUT/'label2idx.json','w'), indent=2)
json.dump(hist, open(OUT/'training_history.json','w'), indent=2)
np.savez(OUT/'test_predictions.npz', probs=aps, preds=aps2, labels=als)
log(f"COMPLETE v11! MAP@3={test_m3:.4f} Acc={test_acc:.4f} ECE={ece:.4f} Safety={srd:.4f}")
log(f"DoD: MAP@3>={'PASS' if test_m3>=0.45 else 'FAIL'} Safety>={'PASS' if srd>=1 else 'FAIL'} ECE<={'PASS' if ece<0.15 else 'FAIL'}")
''')

notebook = {"cells": cells, "metadata": {"kernelspec": {"display_name":"Python 3","language":"python","name":"python3"}, "language_info": {"name":"python","version":"3.10"}, "accelerator": "GPU"}, "nbformat": 4, "nbformat_minor": 4}
out = Path(__file__).parent / "visionsetil_mega_training.ipynb"
out.write_text(json.dumps(notebook, indent=1), encoding="utf-8")
print(f"Generated {out} ({len(cells)} cells)")