pipeline {
    agent any

    environment {
        REGISTRY      = 'ghcr.io'
        IMAGE_NAME    = 'devicaro16/banking-event-sourcing'
        SONAR_HOST    = 'http://sonarqube:9000'
        GIT_REPO_URL  = 'https://github.com/devicaro16/banking-event-sourcing.git'
    }

    triggers {
        pollSCM('H/2 * * * *')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_SHORT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    env.OVERLAY   = env.BRANCH_NAME == 'main' ? 'prod' : 'dev'
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'bun install --frozen-lockfile'
            }
        }

        stage('Unit Tests + Coverage') {
            steps {
                sh 'bun run test:unit:coverage'
            }
        }

        stage('Integration Tests') {
            steps {
                sh 'docker compose -f docker-compose.test.yml up -d'
                sh 'sleep 15'
                sh '''
                    TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/banking_test \
                    TEST_READ_DATABASE_URL=postgres://postgres:postgres@localhost:5435/banking_read_test \
                    TEST_REDIS_URL=redis://localhost:6380 \
                    TEST_KAFKA_BROKERS=localhost:9093 \
                    bun test tests/integration
                '''
            }
            post {
                always {
                    sh 'docker compose -f docker-compose.test.yml down || true'
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('SonarQube') {
                    sh "sonar-scanner -Dsonar.host.url=${SONAR_HOST}"
                }
            }
        }

        stage('Build & Push Image') {
            when {
                anyOf { branch 'main'; branch 'develop' }
            }
            steps {
                script {
                    def fullImage = "${REGISTRY}/${IMAGE_NAME}:${GIT_SHORT}"
                    withCredentials([usernamePassword(
                        credentialsId: 'ghcr-credentials',
                        usernameVariable: 'GHCR_USER',
                        passwordVariable: 'GHCR_TOKEN'
                    )]) {
                        sh "echo '${GHCR_TOKEN}' | docker login ${REGISTRY} -u '${GHCR_USER}' --password-stdin"
                        sh "docker build -t ${fullImage} ."
                        sh "docker push ${fullImage}"
                        sh "docker logout ${REGISTRY}"
                    }
                }
            }
        }

        stage('Update Manifest') {
            when {
                anyOf { branch 'main'; branch 'develop' }
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'github-git-credentials',
                    usernameVariable: 'GIT_USER',
                    passwordVariable: 'GIT_TOKEN'
                )]) {
                    sh """
                        sed -i 's|newTag:.*|newTag: ${GIT_SHORT}|' k8s/overlays/${OVERLAY}/kustomization.yaml
                        git config user.email "jenkins@banking-ci"
                        git config user.name "Jenkins CI"
                        git add k8s/overlays/${OVERLAY}/kustomization.yaml
                        git commit -m "ci(${OVERLAY}): update image tag to ${GIT_SHORT} [skip ci]"
                        git push https://${GIT_USER}:${GIT_TOKEN}@github.com/devicaro16/banking-event-sourcing.git HEAD:${BRANCH_NAME}
                    """
                }
            }
        }
    }

    post {
        always {
            sh 'docker compose -f docker-compose.test.yml down || true'
            cleanWs()
        }
    }
}
