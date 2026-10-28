{{- define "pic2brick.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "pic2brick.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "pic2brick.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{ include "pic2brick.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "pic2brick.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pic2brick.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Eigene Selektoren je Komponente, damit Service und NetworkPolicy sie trennen */}}
{{- define "pic2brick.webSelectorLabels" -}}
{{ include "pic2brick.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end -}}

{{- define "pic2brick.tunnelSelectorLabels" -}}
{{ include "pic2brick.selectorLabels" . }}
app.kubernetes.io/component: tunnel
{{- end -}}

{{- define "pic2brick.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "pic2brick.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "pic2brick.image" -}}
{{- printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) -}}
{{- end -}}
